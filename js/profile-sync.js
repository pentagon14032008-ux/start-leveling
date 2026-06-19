/*
 * LifeOS profile sync
 * Supabase profiles are authoritative. lifeos_profile_cache is the only local cache.
 */

const LIFEOS_PROFILE_CACHE_KEY = 'lifeos_profile_cache';
const LIFEOS_PROFILE_LEGACY_KEY = 'lifeos_profile';
const LEGACY_PROFILE_USERNAME_KEY = 'sl_username';
const LEGACY_PROFILE_AVATAR_KEY = 'sl_avatar';
const PROFILE_UPDATED_EVENT = 'profileUpdated';

let profileStorageMigrated = false;

function migrateLegacyProfileStorage() {
    if (profileStorageMigrated || typeof localStorage === 'undefined') {
        return;
    }

    profileStorageMigrated = true;

    try {
        const currentCache = localStorage.getItem(LIFEOS_PROFILE_CACHE_KEY);

        if (!currentCache) {
            const legacyCache = localStorage.getItem(LIFEOS_PROFILE_LEGACY_KEY);
            if (legacyCache) {
                localStorage.setItem(LIFEOS_PROFILE_CACHE_KEY, legacyCache);
            }
        }

        localStorage.removeItem(LIFEOS_PROFILE_LEGACY_KEY);
        localStorage.removeItem(LEGACY_PROFILE_USERNAME_KEY);
        localStorage.removeItem(LEGACY_PROFILE_AVATAR_KEY);
    } catch (error) {
        console.error('Failed to migrate legacy profile storage:', error);
    }
}

function readProfileCache() {
    migrateLegacyProfileStorage();

    if (typeof localStorage === 'undefined') {
        return null;
    }

    try {
        const rawProfile = localStorage.getItem(LIFEOS_PROFILE_CACHE_KEY);
        return rawProfile ? normalizeProfileSnapshot(JSON.parse(rawProfile)) : null;
    } catch (error) {
        console.error('Failed to read profile cache:', error);
        return null;
    }
}

function writeProfileCache(profile) {
    migrateLegacyProfileStorage();

    if (typeof localStorage === 'undefined') {
        return false;
    }

    try {
        localStorage.setItem(
            LIFEOS_PROFILE_CACHE_KEY,
            JSON.stringify(normalizeProfileSnapshot(profile || {}))
        );
        return true;
    } catch (error) {
        console.error('Failed to write profile cache:', error);
        return false;
    }
}

function normalizeProfileSnapshot(profile, fallback = {}) {
    const snapshot = {
        ...fallback,
        ...profile
    };

    snapshot.id = snapshot.id ?? fallback.id ?? null;
    snapshot.email = snapshot.email ?? fallback.email ?? null;
    snapshot.display_name = snapshot.display_name ?? fallback.display_name ?? null;
    snapshot.avatar_url = snapshot.avatar_url ?? fallback.avatar_url ?? '';
    snapshot.updated_at = snapshot.updated_at ?? fallback.updated_at ?? null;
    snapshot.created_at = snapshot.created_at ?? fallback.created_at ?? null;

    return snapshot;
}

function profileSnapshotsEqual(left, right) {
    const normalizedLeft = normalizeProfileSnapshot(left || {});
    const normalizedRight = normalizeProfileSnapshot(right || {});

    return (
        normalizedLeft.id === normalizedRight.id &&
        normalizedLeft.email === normalizedRight.email &&
        normalizedLeft.display_name === normalizedRight.display_name &&
        normalizedLeft.avatar_url === normalizedRight.avatar_url &&
        normalizedLeft.updated_at === normalizedRight.updated_at &&
        normalizedLeft.created_at === normalizedRight.created_at
    );
}

function emitProfileUpdated(profile) {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(
        new CustomEvent(
            PROFILE_UPDATED_EVENT,
            {
                detail: profile
            }
        )
    );
}

async function loadProfile(profileSync) {
    const cachedProfile = readProfileCache();

    if (cachedProfile) {
        emitProfileUpdated(cachedProfile);
    }

    if (!profileSync) {
        return cachedProfile;
    }

    const cloudProfile = await profileSync.fetchCloudProfile();

    if (!cloudProfile) {
        return cachedProfile;
    }

    const normalizedCloudProfile =
        normalizeProfileSnapshot(
            cloudProfile,
            cachedProfile || {}
        );

    if (
        !cachedProfile ||
        !profileSnapshotsEqual(
            cachedProfile,
            normalizedCloudProfile
        )
    ) {
        writeProfileCache(normalizedCloudProfile);
        emitProfileUpdated(normalizedCloudProfile);
    }

    return normalizedCloudProfile;
}

class ProfileSync {
    constructor(userId) {
        this.userId = userId;
        this.client = initSupabaseClient();
    }

    readCache() {
        return readProfileCache();
    }

    writeCache(profile) {
        return writeProfileCache(profile);
    }

    async fetchCloudProfile() {
        if (!this.client || !this.userId) {
            return null;
        }

        try {
            const { data, error } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', this.userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }

                throw error;
            }

            return normalizeProfileSnapshot(data || {});
        } catch (error) {
            console.error('Failed to fetch profile from Supabase:', error);
            return null;
        }
    }

    async updateProfile(profileData) {
        const currentProfile = readProfileCache() || {};
        const nextProfile = normalizeProfileSnapshot(
            {
                ...currentProfile,
                ...profileData,
                id: this.userId,
                updated_at: new Date().toISOString()
            },
            currentProfile
        );

        this.writeCache(nextProfile);
        emitProfileUpdated(nextProfile);

        if (!this.client || !this.userId) {
            return false;
        }

        try {
            const cloudBaseline = await this.fetchCloudProfile();
            const payloadBase = cloudBaseline || currentProfile;

            const payload = normalizeProfileSnapshot(
                {
                    ...payloadBase,
                    ...profileData,
                    id: this.userId,
                    updated_at: new Date().toISOString()
                },
                payloadBase
            );

            const { data, error } = await this.client
                .from('profiles')
                .upsert(payload)
                .select('*')
                .single();

            if (error) {
                throw error;
            }

            const cloudProfile = normalizeProfileSnapshot(
                data || {},
                nextProfile
            );

            if (!profileSnapshotsEqual(nextProfile, cloudProfile)) {
                this.writeCache(cloudProfile);
                emitProfileUpdated(cloudProfile);
            } else {
                this.writeCache(cloudProfile);
            }

            return true;
        } catch (error) {
            console.error('Failed to sync profile to Supabase:', error);
            return false;
        }
    }
}

if (typeof window !== 'undefined') {
    window.readProfileCache = readProfileCache;
    window.writeProfileCache = writeProfileCache;
    window.loadProfile = loadProfile;
    window.ProfileSync = ProfileSync;
}
