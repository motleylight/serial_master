
import { readFile } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/plugin-fs';

/**
 * Reads a text file, attempting to decode it as UTF-8 first,
 * and falling back to GBK if UTF-8 decoding fails.
 * 
 * @param path Path to the file
 * @param options File read options
 * @returns The decoded string content
 */
export async function readTextFileWithEncoding(
    path: string,
    options?: { baseDir?: BaseDirectory }
): Promise<string> {
    const bytes = await readFile(path, options);

    // Try UTF-8 first
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        return decoder.decode(bytes);
    } catch (e) {
        // If UTF-8 fails, try GBK
        // Note: 'gbk' support depends on the environment (Browser/WebView2 supports it)
        try {
            const decoder = new TextDecoder('gbk');
            return decoder.decode(bytes);
        } catch (gbkError) {
            console.warn('GBK decoding failed or not supported, returning partial/garbled UTF-8', gbkError);
            // Fallback to non-fatal UTF-8 to return whatever we can
            const looseDecoder = new TextDecoder('utf-8');
            return looseDecoder.decode(bytes);
        }
    }
}
