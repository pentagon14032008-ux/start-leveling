/**
 * StartLeveling — direct Supabase persistence.
 * Maps application operations to existing tables/columns only.
 * No browser storage, queues, adapters, or generic state blobs.
 */

const SUPABASE_URL = "https://ipmidfvqftdahvdhasoy.supabase.co";
const SUPABASE_KEY = "sb_publishable_SEQtc6ZDgpDcDTUqqq_Ltw_Yo6_L8cD";
const PORTAL_URL = "https://lifeos-portal.netlify.app/portal.html";

const TABLES = {
    profiles: "profiles",
    userStats: "user_stats",
    tasks: "tasks",
    taskHistory: "task_history",
    dailyPurpose: "daily_purpose",
    dailySnapshots: "daily_snapshots",
    habitTemplates: "habit_templates",
    userSettings: "user_settings"
};

let sharedSupabaseClient = null;

function getSupabaseClient() {

    if (window.supabaseClient) {
        return window.supabaseClient;
    }

    if (sharedSupabaseClient) {
        return sharedSupabaseClient;
    }

    if (typeof supabase !== "undefined" && supabase.createClient) {
        sharedSupabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        window.supabaseClient = sharedSupabaseClient;
        return sharedSupabaseClient;
    }

    return null;
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJsonColumn(value, fallback) {
    if (value == null) {
        return deepClone(fallback);
    }

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch (_error) {
            return deepClone(fallback);
        }
    }

    if (isPlainObject(value) || Array.isArray(value)) {
        return deepClone(value);
    }

    return deepClone(fallback);
}

function normalizeProfileSnapshot(profile, fallback = {}) {
    const source = isPlainObject(profile) ? profile : {};
    const base = isPlainObject(fallback) ? fallback : {};

    return {
        id: source.id ?? base.id ?? null,
        email: source.email ?? base.email ?? null,
        display_name:
            source.display_name ??
            source.full_name ??
            source.username ??
            base.display_name ??
            null,
        avatar_url: source.avatar_url ?? source.avatar ?? base.avatar_url ?? "",
        updated_at: source.updated_at ?? base.updated_at ?? null,
        created_at: source.created_at ?? base.created_at ?? null
    };
}

function mapTaskRowToClient(row) {
    return {
        id: row.id,
        name: row.name ?? row.title ?? "",
        desc: row.description ?? row.desc ?? "",
        sp: Number(row.sp) || 0,
        category: row.category ?? "Uncategorized",
        type: row.type ?? row.task_type ?? "task",
        completed: Boolean(row.completed)
    };
}

function mapTaskClientToRow(task, userId, date) {
    return {
        id: task.id,
        user_id: userId,
        date,
        name: task.name,
        description: task.desc ?? "",
        sp: Number(task.sp) || 0,
        category: task.category,
        type: task.type ?? "task",
        completed: Boolean(task.completed),
        updated_at: new Date().toISOString()
    };
}

function groupTasksByDate(rows) {
    const grouped = {};

    (rows || []).forEach((row) => {
        const date = row.date ?? row.task_date;
        if (!date) {
            return;
        }

        if (!grouped[date]) {
            grouped[date] = [];
        }

        grouped[date].push(mapTaskRowToClient(row));
    });

    return grouped;
}

function mapDailyRowToClient(row) {
    const date = row.date ?? row.purpose_date;
    if (!date) {
        return null;
    }

    return {
        date,
        purpose: row.purpose ?? row.content ?? "",
        routine: row.routine ?? "",
        prayers: parseJsonColumn(row.prayers, {}),
        zikr: parseJsonColumn(row.zikr, {})
    };
}

function mapSnapshotRowToArchive(row) {
    const date = row.date ?? row.snapshot_date;
    if (!date) {
        return null;
    }

    const tasks = parseJsonColumn(row.tasks, []);
    const completedTasks = Array.isArray(tasks)
        ? tasks.filter((task) => task.completed).map((task) => ({
              id: task.id,
              name: task.name,
              category: task.category,
              sp: task.sp,
              type: task.type
          }))
        : [];

    return {
        date,
        tasks,
        prayers: parseJsonColumn(row.prayers, {}),
        zikr: parseJsonColumn(row.zikr, {}),
        completedTasks,
        earnedSp: Number(row.earned_sp) || 0,
        dailyPurpose: row.purpose ?? "",
        disciplineScore: Number(row.discipline_score) || 0,
        consistencyScore: Number(row.consistency_score) || 0,
        readOnly: true
    };
}

class ProfileDocumentStore {
    constructor(userId) {
        this.userId = userId;
        this.client = getSupabaseClient();
    }

    async load() {
        if (!this.client || !this.userId) {
            return normalizeProfileSnapshot();
        }

        const { data, error } = await this.client
            .from(TABLES.profiles)
            .select("id, email, display_name, avatar_url, updated_at, created_at")
            .eq("id", this.userId)
            .maybeSingle();

        if (error) {
            console.error("Failed to load profile:", error);
            return normalizeProfileSnapshot({ id: this.userId });
        }

        return normalizeProfileSnapshot(data || { id: this.userId });
    }

    async save(profile) {
        if (!this.client || !this.userId) {
            return false;
        }

        const normalized = normalizeProfileSnapshot(profile, { id: this.userId });
        const timestamp = new Date().toISOString();
        const payload = {
            id: this.userId,
            display_name: normalized.display_name,
            avatar_url: normalized.avatar_url,
            email: normalized.email,
            updated_at: timestamp
        };

        const { error } = await this.client
            .from(TABLES.profiles)
            .upsert(payload, { onConflict: "id" });

        if (error) {
            console.error("Failed to save profile:", error);
            return false;
        }

        return true;
    }

    async update(partialProfile) {
        const current = await this.load();
        return this.save({ ...current, ...partialProfile, id: this.userId });
    }
}

class StartLevelingCloudStore {
    constructor(userId) {
        this.userId = userId;
        this.client = getSupabaseClient();
    }

    async loadAll() {
        if (!this.client || !this.userId) {
            return {
                tasks: {},
                purpose: {},
                routines: {},
                prayers: {},
                zikr: {},
                lastResetDate: null,
                totalSp: 0,
                archive: []
            };
        }

        const [
            taskResult,
            dailyResult,
            settingsResult,
            statsResult,
            snapshotResult
        ] = await Promise.all([
            this.client
                .from(TABLES.tasks)
                .select("id, user_id, date, name, description, sp, category, type, completed, updated_at")
                .eq("user_id", this.userId),
            this.client
                .from(TABLES.dailyPurpose)
                .select("user_id, date, purpose, routine, prayers, zikr, updated_at")
                .eq("user_id", this.userId),
            this.client
                .from(TABLES.userSettings)
                .select("user_id, last_reset_date, updated_at")
                .eq("user_id", this.userId)
                .maybeSingle(),
            this.client
                .from(TABLES.userStats)
                .select("user_id, total_sp, updated_at")
                .eq("user_id", this.userId)
                .maybeSingle(),
            this.client
                .from(TABLES.dailySnapshots)
                .select(
                    "id, user_id, date, earned_sp, discipline_score, consistency_score, purpose, tasks, prayers, zikr, created_at"
                )
                .eq("user_id", this.userId)
                .order("date", { ascending: false })
        ]);

        [taskResult, dailyResult, settingsResult, statsResult, snapshotResult].forEach(
            (result) => {
                if (result.error) {
                    console.error("StartLeveling load error:", result.error);
                }
            }
        );

        const tasks = groupTasksByDate(taskResult.data || []);
        const purpose = {};
        const routines = {};
        const prayers = {};
        const zikr = {};

        (dailyResult.data || []).forEach((row) => {
            const mapped = mapDailyRowToClient(row);
            if (!mapped) {
                return;
            }

            purpose[mapped.date] = mapped.purpose;
            routines[mapped.date] = mapped.routine;
            prayers[mapped.date] = mapped.prayers;
            zikr[mapped.date] = mapped.zikr;
        });

        const archive = (snapshotResult.data || [])
            .map(mapSnapshotRowToArchive)
            .filter(Boolean);

        return {
            tasks,
            purpose,
            routines,
            prayers,
            zikr,
            lastResetDate: settingsResult.data?.last_reset_date ?? null,
            totalSp: Number(statsResult.data?.total_sp) || 0,
            archive
        };
    }

    async insertTask(task, date) {
        const row = mapTaskClientToRow(task, this.userId, date);
        const { error } = await this.client.from(TABLES.tasks).insert(row);

        if (error) {
            throw error;
        }

        await this.recordTaskHistory({
            task_id: task.id,
            date,
            action: "create",
            name: task.name,
            category: task.category,
            sp: task.sp,
            completed: task.completed
        });

        return true;
    }

    async updateTask(task, date) {
        const row = mapTaskClientToRow(task, this.userId, date);
        const { id, user_id, date: taskDate, ...updates } = row;

        const { error } = await this.client
            .from(TABLES.tasks)
            .update(updates)
            .eq("id", id)
            .eq("user_id", user_id);

        if (error) {
            throw error;
        }

        await this.recordTaskHistory({
            task_id: task.id,
            date: taskDate,
            action: "update",
            name: task.name,
            category: task.category,
            sp: task.sp,
            completed: task.completed
        });

        return true;
    }

    async deleteTask(taskId, date, taskMeta = {}) {
        const { error } = await this.client
            .from(TABLES.tasks)
            .delete()
            .eq("id", taskId)
            .eq("user_id", this.userId);

        if (error) {
            throw error;
        }

        await this.recordTaskHistory({
            task_id: taskId,
            date,
            action: "delete",
            name: taskMeta.name ?? null,
            category: taskMeta.category ?? null,
            sp: taskMeta.sp ?? null,
            completed: taskMeta.completed ?? null
        });

        return true;
    }

    async recordTaskHistory(entry) {
        if (!this.client) {
            return;
        }

        const payload = {
            user_id: this.userId,
            task_id: entry.task_id,
            date: entry.date,
            action: entry.action,
            name: entry.name,
            category: entry.category,
            sp: entry.sp,
            completed: entry.completed,
            created_at: new Date().toISOString()
        };

        const { error } = await this.client.from(TABLES.taskHistory).insert(payload);

        if (error) {
            console.error("Failed to write task_history:", error);
        }
    }

    async upsertDailyRecord(date, fields) {
        const payload = {
            user_id: this.userId,
            date,
            updated_at: new Date().toISOString()
        };

        if (Object.prototype.hasOwnProperty.call(fields, "purpose")) {
            payload.purpose = fields.purpose ?? "";
        }

        if (Object.prototype.hasOwnProperty.call(fields, "routine")) {
            payload.routine = fields.routine ?? "";
        }

        if (Object.prototype.hasOwnProperty.call(fields, "prayers")) {
            payload.prayers = deepClone(fields.prayers ?? {});
        }

        if (Object.prototype.hasOwnProperty.call(fields, "zikr")) {
            payload.zikr = deepClone(fields.zikr ?? {});
        }

        const { error } = await this.client
            .from(TABLES.dailyPurpose)
            .upsert(payload, { onConflict: "user_id,date" });

        if (error) {
            throw error;
        }

        return true;
    }

    async updateUserStats(totalSp) {
        const payload = {
            user_id: this.userId,
            total_sp: Number(totalSp) || 0,
            updated_at: new Date().toISOString()
        };

        const { error } = await this.client
            .from(TABLES.userStats)
            .upsert(payload, { onConflict: "user_id" });

        if (error) {
            throw error;
        }

        return true;
    }

    async updateUserSettings(settings) {
        const payload = {
            user_id: this.userId,
            updated_at: new Date().toISOString()
        };

        if (Object.prototype.hasOwnProperty.call(settings, "last_reset_date")) {
            payload.last_reset_date = settings.last_reset_date;
        }

        const { error } = await this.client
            .from(TABLES.userSettings)
            .upsert(payload, { onConflict: "user_id" });

        if (error) {
            throw error;
        }

        return true;
    }

    async insertSnapshot(entry) {
        const payload = {
            user_id: this.userId,
            date: entry.date,
            earned_sp: Number(entry.earnedSp) || 0,
            discipline_score: Number(entry.disciplineScore) || 0,
            consistency_score: Number(entry.consistencyScore) || 0,
            purpose: entry.dailyPurpose ?? "",
            tasks: deepClone(entry.tasks ?? []),
            prayers: deepClone(entry.prayers ?? {}),
            zikr: deepClone(entry.zikr ?? {}),
            created_at: new Date().toISOString()
        };

        const { error } = await this.client.from(TABLES.dailySnapshots).insert(payload);

        if (error) {
            throw error;
        }

        return true;
    }

    async upsertHabitTemplate(template) {
        const payload = {
            user_id: this.userId,
            habit_key: template.habit_key,
            habit_type: template.habit_type,
            name: template.name,
            target: Number(template.target) || 0,
            sp: Number(template.sp) || 25,
            default_time: template.default_time ?? null,
            sort_order: Number(template.sort_order) || 0,
            updated_at: new Date().toISOString()
        };

        const { error } = await this.client
            .from(TABLES.habitTemplates)
            .upsert(payload, { onConflict: "user_id,habit_key" });

        if (error) {
            throw error;
        }

        return true;
    }

    async deleteHabitTemplate(habitKey) {
        const { error } = await this.client
            .from(TABLES.habitTemplates)
            .delete()
            .eq("user_id", this.userId)
            .eq("habit_key", habitKey);

        if (error) {
            throw error;
        }

        return true;
    }

    async executeMutation(mutation, appState) {
        const type = mutation?.type ?? "full";

        if (type === "task") {
            const date = mutation.date ?? appState.currentDate;

            if (mutation.op === "insert") {
                await this.insertTask(mutation.task, date);
            } else if (mutation.op === "update") {
                await this.updateTask(mutation.task, date);
            } else if (mutation.op === "delete") {
                await this.deleteTask(mutation.taskId, date, mutation.taskMeta);
            }

            await this.updateUserStats(appState.totalSp);
            return;
        }

        if (type === "daily") {
            const date = mutation.date ?? appState.currentDate;
            await this.upsertDailyRecord(date, {
                purpose: appState.purpose[date] ?? "",
                routine: appState.routines[date] ?? "",
                prayers: appState.prayers[date] ?? {},
                zikr: appState.zikr[date] ?? {}
            });

            if (mutation.syncStats) {
                await this.updateUserStats(appState.totalSp);
            }

            return;
        }

        if (type === "stats") {
            await this.updateUserStats(appState.totalSp);
            return;
        }

        if (type === "settings") {
            await this.updateUserSettings({
                last_reset_date: appState.lastResetDate
            });
            return;
        }

        if (type === "snapshot") {
            await this.insertSnapshot(mutation.entry);
            return;
        }

        if (type === "habit") {
            if (mutation.op === "delete") {
                await this.deleteHabitTemplate(mutation.habitKey);
            } else {
                await this.upsertHabitTemplate(mutation.template);
            }

            return;
        }

        await this.syncFullState(appState);
    }

    async syncFullState(appState) {
        const dates = new Set([
            ...Object.keys(appState.tasks || {}),
            ...Object.keys(appState.purpose || {}),
            ...Object.keys(appState.routines || {}),
            ...Object.keys(appState.prayers || {}),
            ...Object.keys(appState.zikr || {})
        ]);

        const operations = [];

        Object.entries(appState.tasks || {}).forEach(([date, tasks]) => {
            (tasks || []).forEach((task) => {
                const row = mapTaskClientToRow(task, this.userId, date);
                operations.push(
                    this.client
                        .from(TABLES.tasks)
                        .upsert(row, { onConflict: "id" })
                        .then(({ error }) => {
                            if (error) {
                                throw error;
                            }
                        })
                );
            });
        });

        dates.forEach((date) => {
            operations.push(
                this.upsertDailyRecord(date, {
                    purpose: appState.purpose[date] ?? "",
                    routine: appState.routines[date] ?? "",
                    prayers: appState.prayers[date] ?? {},
                    zikr: appState.zikr[date] ?? {}
                })
            );
        });

        operations.push(this.updateUserStats(appState.totalSp));
        operations.push(
            this.updateUserSettings({
                last_reset_date: appState.lastResetDate
            })
        );

        await Promise.all(operations);
    }
}

window.getSupabaseClient = getSupabaseClient;
window.PORTAL_URL = PORTAL_URL;
window.ProfileDocumentStore = ProfileDocumentStore;
window.StartLevelingCloudStore = StartLevelingCloudStore;
window.StartLevelingStateStore = StartLevelingCloudStore;
window.normalizeProfileSnapshot = normalizeProfileSnapshot;
