/**
 * LifeOS Supabase Sync Module
 * Queue-backed local sync for non-profile data. Profiles are handled in js/profile-sync.js.
 */

const SUPABASE_URL = "https://ipmidfvqftdahvdhasoy.supabase.co";
const SUPABASE_KEY = "sb_publishable_SEQtc6ZDgpDcDTUqqq_Ltw_Yo6_L8cD";

let supabaseClient = null;

// Initialize Supabase client
function initSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return supabaseClient;
    }
    
    console.error('Supabase library not loaded');
    return null;
}

// ==========================================
// OFFLINE QUEUE SYSTEM
// ==========================================
const SYNC_QUEUE_KEY = 'lifeos_sync_queue';
const QUEUEABLE_TABLES = new Set([
    'tasks',
    'task_history',
    'user_stats',
    'daily_purpose',
    'daily_snapshots',
    'habit_templates',
    'user_settings'
]);

function getSyncQueue() {
    try {
        const queue = localStorage.getItem(SYNC_QUEUE_KEY);
        return queue ? JSON.parse(queue) : [];
    } catch (e) {
        console.error('Failed to parse sync queue:', e);
        return [];
    }
}

function saveSyncQueue(queue) {
    try {
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error('Failed to save sync queue:', e);
    }
}

function addToSyncQueue(operation) {
    if (!operation || !QUEUEABLE_TABLES.has(operation.table)) {
        return false;
    }

    const queue = getSyncQueue();
    queue.push({
        ...operation,
        timestamp: new Date().toISOString(),
        retries: 0
    });
    saveSyncQueue(queue);
    return true;
}

function removeFromSyncQueue(index) {
    const queue = getSyncQueue();
    queue.splice(index, 1);
    saveSyncQueue(queue);
}

async function processSyncQueue() {
    const client = initSupabaseClient();
    if (!client) return;

    const queue = getSyncQueue().filter(operation =>
        operation && QUEUEABLE_TABLES.has(operation.table)
    );

    if (queue.length === 0) {
        saveSyncQueue([]);
        return;
    }

    const storedQueue = getSyncQueue();
    if (storedQueue.length !== queue.length) {
        saveSyncQueue(queue);
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    for (let i = queue.length - 1; i >= 0; i--) {
        const operation = queue[i];
        
        try {
            await executeSyncOperation(client, operation);
            removeFromSyncQueue(i);
        } catch (error) {
            operation.retries = (operation.retries || 0) + 1;
            if (operation.retries >= 5) {
                console.error('Sync operation failed after 5 retries:', operation, error);
                removeFromSyncQueue(i);
            } else {
                queue[i] = operation;
                saveSyncQueue(queue);
            }
        }
    }
}

async function executeSyncOperation(client, operation) {
    const { table, action, data, id } = operation;
    
    switch (action) {
        case 'upsert':
            await client.from(table).upsert(data);
            break;
        case 'delete':
            await client.from(table).delete().eq('id', id);
            break;
        default:
            console.error('Unknown sync action:', action);
    }
}

// ==========================================
// CONFLICT RESOLUTION
// ==========================================
function resolveConflict(localData, cloudData) {
    if (!cloudData) return localData;
    if (!localData) return cloudData;
    
    const localUpdatedAt = new Date(localData.updated_at || 0);
    const cloudUpdatedAt = new Date(cloudData.updated_at || 0);
    
    return cloudUpdatedAt > localUpdatedAt ? cloudData : localData;
}

// ==========================================
// GENERIC SYNC MANAGER
// ==========================================
class SyncManager {
    constructor(tableName, localStorageKey, userId) {
        this.tableName = tableName;
        this.localStorageKey = localStorageKey;
        this.userId = userId;
        this.client = initSupabaseClient();
    }

    // Load from localStorage (PRIMARY)
    loadLocal() {
        try {
            const data = localStorage.getItem(this.localStorageKey);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`Failed to load local data for ${this.localStorageKey}:`, e);
            return null;
        }
    }

    // Save to localStorage (PRIMARY)
    saveLocal(data) {
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error(`Failed to save local data for ${this.localStorageKey}:`, e);
            return false;
        }
    }

    // Sync from cloud (SECONDARY - merge with local)
    async syncFromCloud() {
        if (!this.client || !this.userId) return null;

        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('*')
                .eq('user_id', this.userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows returned
                    return null;
                }
                throw error;
            }

            const localData = this.loadLocal();
            const mergedData = resolveConflict(localData, data);
            
            if (mergedData !== localData) {
                this.saveLocal(mergedData);
            }

            return mergedData;
        } catch (e) {
            console.error(`Failed to sync from cloud for ${this.tableName}:`, e);
            return null;
        }
    }

    // Sync to cloud (SECONDARY - queued)
    async syncToCloud(data) {
        if (!this.client || !this.userId) {
            console.warn('Cannot sync to cloud: no client or user ID');
            return false;
        }

        const syncData = {
            ...data,
            user_id: this.userId,
            updated_at: new Date().toISOString()
        };

        try {
            const { error } = await this.client
                .from(this.tableName)
                .upsert(syncData);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error(`Failed to sync to cloud for ${this.tableName}:`, e);
            // Queue for retry
            addToSyncQueue({
                table: this.tableName,
                action: 'upsert',
                data: syncData
            });
            return false;
        }
    }

    // Local-first update pattern
    async update(data) {
        // 1. Update localStorage immediately (PRIMARY)
        const success = this.saveLocal(data);
        
        if (!success) {
            console.error('Failed to save local data');
            return false;
        }

        // 2. Queue cloud sync (SECONDARY - non-blocking)
        addToSyncQueue({
            table: this.tableName,
            action: 'upsert',
            data: {
                ...data,
                user_id: this.userId,
                updated_at: new Date().toISOString()
            }
        });

        return true;
    }
}

// ==========================================
// STARTLEVELING TABLE SYNC MANAGERS
// ==========================================
class UserStatsSync extends SyncManager {
    constructor(userId) {
        super('user_stats', 'sl_user_stats', userId);
    }
}

class TasksSync extends SyncManager {
    constructor(userId) {
        super('tasks', 'sl_tasks', userId);
    }
}

class TaskHistorySync extends SyncManager {
    constructor(userId) {
        super('task_history', 'sl_task_history', userId);
    }
}

class DailyPurposeSync extends SyncManager {
    constructor(userId) {
        super('daily_purpose', 'sl_daily_purpose', userId);
    }
}

class DailySnapshotsSync extends SyncManager {
    constructor(userId) {
        super('daily_snapshots', 'sl_daily_snapshots', userId);
    }
}

class HabitTemplatesSync extends SyncManager {
    constructor(userId) {
        super('habit_templates', 'sl_habit_templates', userId);
    }
}

class UserSettingsSync extends SyncManager {
    constructor(userId) {
        super('user_settings', 'sl_user_settings', userId);
    }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
async function getCurrentUserId() {
    const client = initSupabaseClient();
    if (!client) return null;

    try {
        const { data: { user } } = await client.auth.getUser();
        return user ? user.id : null;
    } catch (e) {
        console.error('Failed to get current user:', e);
        return null;
    }
}

// Initialize sync queue processing on page load
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        // Process sync queue after a short delay
        setTimeout(() => {
            processSyncQueue();
        }, 2000);

        // Process sync queue every 30 seconds
        setInterval(processSyncQueue, 30000);

        // Process sync queue when window gains focus (user returns to tab)
        window.addEventListener('focus', processSyncQueue);
    });
}
