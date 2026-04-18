import PocketBase from 'pocketbase';

const pbUrl = import.meta.env.VITE_POCKETBASE_URL;

if (!pbUrl) {
    console.warn("VITE_POCKETBASE_URL is not set in .env.local!");
}

export const pb = new PocketBase(pbUrl || 'http://127.0.0.1:8090');
