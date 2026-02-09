export const DEFAULT_MODELS: Record<string, string> = {
	editor_in_chief: 'anthropic/claude-sonnet-4-5',
	writer: 'anthropic/claude-sonnet-4-5',
	researcher: 'google/gemini-2.0-flash',
	section_editor: 'openai/gpt-4o',
	copy_editor: 'anthropic/claude-sonnet-4-5',
	fact_checker: 'google/gemini-2.0-flash',
	reader_advocate: 'openai/gpt-4o',
	default: 'inherit',
};

// File operation limits
export const MAX_FILE_SIZE = 10_485_760; // 10 MB in bytes
export const MAX_DIRECTORY_DEPTH = 10;
