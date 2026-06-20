/*
 * LifeOS profile sync
 * Profiles now load and save directly from Supabase with no browser cache.
 */

const PROFILE_UPDATED_EVENT = "profileUpdated";

function emitProfileUpdated(profile) {
    if (typeof window === "undefined") {
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
    if (!profileSync) {
        return null;
    }

    const profile = await profileSync.loadProfile();

    if (profile) {
        emitProfileUpdated(profile);
    }

    return profile;
}

class ProfileSync {
    constructor(userId) {
        this.userId = userId;
        this.store = new ProfileDocumentStore(userId);
    }

    async loadProfile() {
        const profile = await this.store.load();
        return normalizeProfileSnapshot(profile);
    }

    async updateProfile(profileData) {
        const success = await this.store.update(profileData);

        if (!success) {
            return false;
        }

        const profile = await this.loadProfile();
        emitProfileUpdated(profile);
        return true;
    }

    async saveProfile(profileData) {
        const success = await this.store.save(profileData);

        if (!success) {
            return false;
        }

        const profile = await this.loadProfile();
        emitProfileUpdated(profile);
        return true;
    }

    async deleteProfile() {
        return this.store.delete();
    }
}

if (typeof window !== "undefined") {
    window.loadProfile = loadProfile;
    window.ProfileSync = ProfileSync;
    window.emitProfileUpdated = emitProfileUpdated;
}
