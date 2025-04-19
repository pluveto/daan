// src/lib/download.ts
export function downloadJson(data: any, filename: string) {
  try {
    const jsonString = JSON.stringify(data, null, 2); // Pretty print JSON
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up
  } catch (error) {
    console.error('Error creating download:', error);
    // Consider adding user feedback, e.g., using toast
    alert(
      `Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
