// src/lib/file.ts
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        resolve(event.target.result);
      } else {
        reject(new Error('Failed to read file content as text.'));
      }
    };
    reader.onerror = (event) => {
      console.error('FileReader error:', event.target?.error);
      reject(event.target?.error || new Error('Unknown FileReader error.'));
    };
    reader.readAsText(file);
  });
}
