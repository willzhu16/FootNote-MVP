/**
 * In-memory store for audio chunk URIs that couldn't be transcribed
 * during recording (e.g., device was offline the entire session).
 *
 * These are local file:// URIs created by expo-audio. They remain valid
 * for the current app session. If the app is restarted, the temp files
 * are likely gone and transcription will no longer be possible.
 */
const store = new Map<string, string[]>();

export const pendingAudio = {
  set(noteId: string, uris: string[]): void {
    if (uris.length > 0) {
      store.set(noteId, uris);
    } else {
      store.delete(noteId);
    }
  },

  get(noteId: string): string[] {
    return store.get(noteId) ?? [];
  },

  has(noteId: string): boolean {
    return store.has(noteId) && (store.get(noteId)?.length ?? 0) > 0;
  },

  clear(noteId: string): void {
    store.delete(noteId);
  },
};
