export interface RefinedItem {
    id: string; // unique identifier (e.g., commit sha)
    type: "commit";
    content: string; // The full text chunk for embedding
    metadata: {
        sha: string;
        author: string;
        date: string;
        message: string;
        fileCount: number;
    };
}

export interface RefinedData {
    items: RefinedItem[];
}
