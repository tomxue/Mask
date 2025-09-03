import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const maskedRanges = new Map<string, vscode.Range[]>();
const customReplacements = new Map<string, string>();
let maskDecoration: vscode.TextEditorDecorationType;

interface MaskData {
	ranges: Array<{
		start: { line: number; character: number };
		end: { line: number; character: number };
	}>;
	filename?: string;
	fileSize?: number;
	lineCount?: number;
	md5Hash?: string;
}

interface MaskStorage {
	[filePath: string]: MaskData;
}

function calculateFileMetadata(filePath: string): { filename: string; fileSize: number; lineCount: number; md5Hash: string } | null {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		
		const stats = fs.statSync(filePath);
		const fileContent = fs.readFileSync(filePath, 'utf8');
		const lines = fileContent.split('\n');
		
		const hash = crypto.createHash('md5');
		hash.update(fileContent);
		
		return {
			filename: path.basename(filePath),
			fileSize: stats.size,
			lineCount: lines.length,
			md5Hash: hash.digest('hex')
		};
	} catch (error) {
		console.error(`Error calculating file metadata for ${filePath}:`, error);
		return null;
	}
}

function findMatchingFileInStorage(currentFileUri: string, storage: MaskStorage): string | null {
	// First check if the exact path exists in storage
	if (storage[currentFileUri]) {
		return currentFileUri;
	}
	
	// Get current file metadata
	const uri = vscode.Uri.parse(currentFileUri);
	const currentFilePath = uri.fsPath;
	const currentMetadata = calculateFileMetadata(currentFilePath);
	
	if (!currentMetadata) {
		return null;
	}
	
	// Search through storage for matching metadata
	for (const [storedFileUri, maskData] of Object.entries(storage)) {
		// Skip if no metadata exists (old format)
		if (maskData.fileSize === undefined || !maskData.lineCount || !maskData.md5Hash) {
			continue;
		}
		
		// Check file size and line count match first (fast comparison)
		if (maskData.fileSize !== currentMetadata.fileSize || 
			maskData.lineCount !== currentMetadata.lineCount) {
			continue;
		}
		
		// Check MD5 hash match (more expensive comparison)
		if (maskData.md5Hash !== currentMetadata.md5Hash) {
			continue;
		}
		
		// All metadata matches - this is the same file
		return storedFileUri;
	}
	
	return null;
}

function findOneDriveDirectory(): string | null {
	// First, try environment variables (most reliable)
	const oneDriveFromEnv = process.env['OneDrive'] || process.env['ONEDRIVE'];
	if (oneDriveFromEnv && fs.existsSync(oneDriveFromEnv)) {
		return oneDriveFromEnv;
	}
	
	// Check Windows-specific locations
	if (process.platform === 'win32') {
		const os = require('os');
		const homedir = os.homedir();
		
		// Check user home directory for OneDrive
		const homeOneDrivePath = path.join(homedir, 'OneDrive');
		if (fs.existsSync(homeOneDrivePath)) {
			return homeOneDrivePath;
		}
		
		// Check for enterprise OneDrive patterns
		try {
			// Check in user home directory for OneDrive - * pattern
			const homeFiles = fs.readdirSync(homedir);
			
			for (const file of homeFiles) {
				if (file.startsWith('OneDrive - ')) {
					const fullPath = path.join(homedir, file);
					if (fs.statSync(fullPath).isDirectory()) {
						return fullPath;
					}
				}
			}
		} catch (err) {
			// Error scanning for OneDrive patterns
		}
	}
	
	return null;
}

function getStorageFilePath(): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	const oneDriveDir = findOneDriveDirectory();
	
	if (!workspaceFolder) {
		// Use OneDrive if available, otherwise fall back to home directory
		if (oneDriveDir) {
			const storageDir = path.join(oneDriveDir, '.vscode-mask-storage');
			if (!fs.existsSync(storageDir)) {
				fs.mkdirSync(storageDir, { recursive: true });
			}
			return path.join(storageDir, 'mask-storage.json');
		}
		return path.join(require('os').homedir(), '.vscode-mask-storage.json');
	}
	
	// Use OneDrive for storage if available
	if (oneDriveDir) {
		const storageDir = path.join(oneDriveDir, '.vscode-mask-storage');
		if (!fs.existsSync(storageDir)) {
			fs.mkdirSync(storageDir, { recursive: true });
		}
		return path.join(storageDir, 'mask-storage.json');
	}
	
	// Use local workspace .vscode directory
	const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
	if (!fs.existsSync(vscodeDir)) {
		fs.mkdirSync(vscodeDir, { recursive: true });
	}
	return path.join(vscodeDir, 'mask-storage.json');
}

function mergeOverlappingRanges(ranges: vscode.Range[], fileUri: string): vscode.Range[] {
	if (ranges.length <= 1) return ranges;
	
	// Sort ranges by start position
	const sortedRanges = ranges.sort((a, b) => {
		if (a.start.line !== b.start.line) {
			return a.start.line - b.start.line;
		}
		return a.start.character - b.start.character;
	});
	
	const mergedRanges: vscode.Range[] = [];
	let currentRange = sortedRanges[0];
	let currentReplacementText = customReplacements.get(currentRange.toString() + fileUri) || '[***]';
	
	for (let i = 1; i < sortedRanges.length; i++) {
		const nextRange = sortedRanges[i];
		const nextReplacementText = customReplacements.get(nextRange.toString() + fileUri) || '[***]';
		
		// Check if ranges overlap or are adjacent
		const currentEnd = currentRange.end;
		const nextStart = nextRange.start;
		
		const overlapsOrAdjacent = 
			// Same line: check character positions
			(currentEnd.line === nextStart.line && currentEnd.character >= nextStart.character) ||
			// Adjacent lines: current ends at end of line, next starts at beginning of next line
			(currentEnd.line + 1 === nextStart.line && nextStart.character === 0) ||
			// Overlapping lines
			currentEnd.line > nextStart.line;
		
		if (overlapsOrAdjacent) {
			// Merge ranges - extend current range to cover both
			const newEnd = currentRange.end.isAfter(nextRange.end) ? currentRange.end : nextRange.end;
			const mergedRange = new vscode.Range(currentRange.start, newEnd);
			
			// Remove old replacement texts
			customReplacements.delete(currentRange.toString() + fileUri);
			customReplacements.delete(nextRange.toString() + fileUri);
			
			// Use the replacement text from the first range, or combine if different
			let mergedReplacementText = currentReplacementText;
			if (currentReplacementText !== nextReplacementText) {
				mergedReplacementText = `${currentReplacementText}`;
			}
			
			currentRange = mergedRange;
			customReplacements.set(currentRange.toString() + fileUri, mergedReplacementText);
		} else {
			// No overlap, add current range to result and move to next
			mergedRanges.push(currentRange);
			currentRange = nextRange;
			currentReplacementText = nextReplacementText;
		}
	}
	
	// Add the last range
	mergedRanges.push(currentRange);
	
	return mergedRanges;
}

function saveMasksToFile() {
	try {
		const storage: MaskStorage = {};
		
		for (const [fileUri, ranges] of maskedRanges.entries()) {
			// Skip entries with empty ranges
			if (!ranges || ranges.length === 0) {
				continue;
			}
			
			// First remove exact duplicates, then merge overlapping ranges
			const uniqueRanges = ranges.filter((range, index, array) => {
				return array.findIndex(r => 
					r.start.line === range.start.line &&
					r.start.character === range.start.character &&
					r.end.line === range.end.line &&
					r.end.character === range.end.character
				) === index;
			});
			
			const mergedRanges = mergeOverlappingRanges(uniqueRanges, fileUri);
			
			// Only save if there are still ranges after merging
			if (mergedRanges.length > 0) {
				// Get file metadata
				const uri = vscode.Uri.parse(fileUri);
				const filePath = uri.fsPath;
				const metadata = calculateFileMetadata(filePath);
				
				if (metadata) {
					const maskData: MaskData = {
						ranges: mergedRanges.map(range => ({
							start: { line: range.start.line, character: range.start.character },
							end: { line: range.end.line, character: range.end.character }
						})),
						filename: metadata.filename,
						fileSize: metadata.fileSize,
						lineCount: metadata.lineCount,
						md5Hash: metadata.md5Hash
					};
					storage[fileUri] = maskData;
					
					// Update the in-memory ranges with the merged version
					maskedRanges.set(fileUri, mergedRanges);
				}
			}
		}
		
		const storageFilePath = getStorageFilePath();
		fs.writeFileSync(storageFilePath, JSON.stringify(storage, null, 2));
	} catch (error) {
		console.error('Failed to save masks:', error);
	}
}

function validateAndCleanMaskRanges(fileUri: string, ranges: vscode.Range[]): vscode.Range[] {
	try {
		// Convert URI to file path
		const uri = vscode.Uri.parse(fileUri);
		if (uri.scheme !== 'file') {
			return ranges; // Only validate local files
		}
		
		const filePath = uri.fsPath;
		if (!fs.existsSync(filePath)) {
			console.log(`File no longer exists, removing all mask ranges: ${filePath}`);
			return [];
		}
		
		// Get actual file line count
		const fileContent = fs.readFileSync(filePath, 'utf8');
		const fileLines = fileContent.split('\n');
		const maxLine = fileLines.length - 1; // 0-based indexing
		
		// Filter out ranges that exceed file bounds
		const validRanges = ranges.filter(range => {
			const startValid = range.start.line <= maxLine;
			const endValid = range.end.line <= maxLine;
			
			if (!startValid || !endValid) {
				console.log(`Removing invalid mask range: lines ${range.start.line}-${range.end.line} (file has ${fileLines.length} lines)`);
				// Also remove any custom replacement text for this range
				customReplacements.delete(range.toString() + fileUri);
				return false;
			}
			
			return true;
		});
		
		// If ranges were removed, update the storage file
		if (validRanges.length !== ranges.length) {
			console.log(`Cleaned ${ranges.length - validRanges.length} invalid ranges from ${filePath}`);
		}
		
		return validRanges;
	} catch (error) {
		console.error(`Error validating ranges for ${fileUri}:`, error);
		return ranges; // Return original ranges if validation fails
	}
}

function loadMasksForSingleFile(fileUri: string): boolean {
	try {
		const storageFilePath = getStorageFilePath();
		if (!fs.existsSync(storageFilePath)) {
			return false;
		}
		
		const data = fs.readFileSync(storageFilePath, 'utf8');
		const storage: MaskStorage = JSON.parse(data);
		
		let hasChanges = false;
		const matchingStorageKey = findMatchingFileInStorage(fileUri, storage);
		
		if (matchingStorageKey) {
			const maskData = storage[matchingStorageKey];
			
			// Skip entries with empty ranges
			if (!maskData.ranges || maskData.ranges.length === 0) {
				return false;
			}
			
			// Check if this entry is missing metadata (old format) and try to update it
			if (!maskData.filename || maskData.fileSize === undefined || 
				!maskData.lineCount || !maskData.md5Hash) {
				
				const uri = vscode.Uri.parse(fileUri);
				const filePath = uri.fsPath;
				const metadata = calculateFileMetadata(filePath);
				
				if (metadata) {
					// Update the storage entry with metadata
					maskData.filename = metadata.filename;
					maskData.fileSize = metadata.fileSize;
					maskData.lineCount = metadata.lineCount;
					maskData.md5Hash = metadata.md5Hash;
					hasChanges = true;
					console.log(`Updated old format entry with metadata: ${matchingStorageKey}`);
				}
			}
			
			const ranges = maskData.ranges.map(rangeData => {
				const range = new vscode.Range(
					new vscode.Position(rangeData.start.line, rangeData.start.character),
					new vscode.Position(rangeData.end.line, rangeData.end.character)
				);
				return range;
			});
			
			// Validate and clean ranges against actual file content
			const validRanges = validateAndCleanMaskRanges(fileUri, ranges);
			
			if (validRanges.length !== ranges.length) {
				hasChanges = true;
			}
			
			if (validRanges.length > 0) {
				maskedRanges.set(fileUri, validRanges);
				
				// If the storage key is different from current file URI, update storage
				if (matchingStorageKey !== fileUri) {
					hasChanges = true;
					console.log(`Found matching file by metadata: ${matchingStorageKey} -> ${fileUri}`);
				}
				
				// Save changes if any
				if (hasChanges) {
					saveMasksToFile();
				}
				
				return true;
			}
		}
		
		return false;
	} catch (error) {
		console.error(`Failed to load masks for file ${fileUri}:`, error);
		return false;
	}
}

function loadMasksFromFile() {
	try {
		const storageFilePath = getStorageFilePath();
		
		if (!fs.existsSync(storageFilePath)) {
			return;
		}
		
		const data = fs.readFileSync(storageFilePath, 'utf8');
		const storage: MaskStorage = JSON.parse(data);
		
		maskedRanges.clear();
		let hasChanges = false;
		
		// Get all currently open files and the active editor
		const openFiles = vscode.workspace.textDocuments.map(doc => doc.uri.toString());
		const activeEditor = vscode.window.activeTextEditor;
		
		// Add active editor file if not already in the list
		if (activeEditor && !openFiles.includes(activeEditor.document.uri.toString())) {
			openFiles.push(activeEditor.document.uri.toString());
		}
		
		// Process storage entries and try to match with open files
		const processedStorageKeys = new Set<string>();
		
		for (const openFileUri of openFiles) {
			const matchingStorageKey = findMatchingFileInStorage(openFileUri, storage);
			
			if (matchingStorageKey) {
				const maskData = storage[matchingStorageKey];
				
				// Skip entries with empty ranges
				if (!maskData.ranges || maskData.ranges.length === 0) {
					hasChanges = true;
					continue;
				}
				
				// Check if this entry is missing metadata (old format) and try to update it
				if (maskData.fileSize === undefined || !maskData.lineCount || !maskData.md5Hash) {
					
					const uri = vscode.Uri.parse(openFileUri);
					const filePath = uri.fsPath;
					const metadata = calculateFileMetadata(filePath);
					
					if (metadata) {
						// Update the storage entry with metadata
						maskData.filename = metadata.filename;
						maskData.fileSize = metadata.fileSize;
						maskData.lineCount = metadata.lineCount;
						maskData.md5Hash = metadata.md5Hash;
						hasChanges = true;
					}
				}
				
				const ranges = maskData.ranges.map(rangeData => {
					const range = new vscode.Range(
						new vscode.Position(rangeData.start.line, rangeData.start.character),
						new vscode.Position(rangeData.end.line, rangeData.end.character)
					);
					return range;
				});
				
				// Validate and clean ranges against actual file content
				const validRanges = validateAndCleanMaskRanges(openFileUri, ranges);
				
				if (validRanges.length !== ranges.length) {
					hasChanges = true;
				}
				
				if (validRanges.length > 0) {
					maskedRanges.set(openFileUri, validRanges);
					
					// If the storage key is different from current file URI, update storage
					if (matchingStorageKey !== openFileUri) {
						hasChanges = true;
					}
				}
				
				// Mark this storage key as processed
				processedStorageKeys.add(matchingStorageKey);
			}
		}
		
		// Also process any remaining storage entries that weren't matched by open files
		// (for backward compatibility and files that might be opened later)
		for (const [fileUri, maskData] of Object.entries(storage)) {
			if (processedStorageKeys.has(fileUri)) {
				continue;
			}
			
			// Skip entries with empty ranges
			if (!maskData.ranges || maskData.ranges.length === 0) {
				hasChanges = true;
				continue;
			}
			
			// Check if this entry is missing metadata (old format) and try to update it
			if (maskData.fileSize === undefined || !maskData.lineCount || !maskData.md5Hash) {
				
				const uri = vscode.Uri.parse(fileUri);
				const filePath = uri.fsPath;
				const metadata = calculateFileMetadata(filePath);
				
				if (metadata) {
					// Update the storage entry with metadata
					maskData.filename = metadata.filename;
					maskData.fileSize = metadata.fileSize;
					maskData.lineCount = metadata.lineCount;
					maskData.md5Hash = metadata.md5Hash;
					hasChanges = true;
				}
			}
			
			const ranges = maskData.ranges.map(rangeData => {
				const range = new vscode.Range(
					new vscode.Position(rangeData.start.line, rangeData.start.character),
					new vscode.Position(rangeData.end.line, rangeData.end.character)
				);
				return range;
			});
			
			// Validate and clean ranges against actual file content
			const validRanges = validateAndCleanMaskRanges(fileUri, ranges);
			
			if (validRanges.length !== ranges.length) {
				hasChanges = true;
			}
			
			if (validRanges.length > 0) {
				maskedRanges.set(fileUri, validRanges);
			}
		}
		
		// Save cleaned storage if there were changes
		if (hasChanges) {
			saveMasksToFile();
		}
		
		refreshDecorations();
	} catch (error) {
		console.error('Failed to load masks:', error);
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Mask extension is now active');
	updateDecorationStyle();
	loadMasksFromFile();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('mask')) {
				updateDecorationStyle();
				refreshDecorations();
			}
		})
	);

	let markMasked = vscode.commands.registerCommand('mask.markMasked', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selection = editor.selection;
		if (selection.isEmpty) return;

		let replacementText = context.workspaceState.get<string>('mask.lastUsedText');
		
		if (!replacementText) {
			const config = vscode.workspace.getConfiguration('mask');
			const defaultText = config.get<string>('replacementText') || '[***]';
			
			replacementText = await vscode.window.showInputBox({
				prompt: 'Enter text to show when copying this section (you can change this later in settings)',
				placeHolder: 'e.g., [***], [API_KEY], etc.',
				value: defaultText
			});

			if (!replacementText) return;
			await context.workspaceState.update('mask.lastUsedText', replacementText);
		}

		const fileUri = editor.document.uri.toString();
		const ranges = maskedRanges.get(fileUri) || [];
		const range = new vscode.Range(selection.start, selection.end);
		
		// Add the new range
		ranges.push(range);
		customReplacements.set(range.toString() + fileUri, replacementText);
		
		// Merge overlapping ranges immediately
		const mergedRanges = mergeOverlappingRanges(ranges, fileUri);
		maskedRanges.set(fileUri, mergedRanges);

		saveMasksToFile();
		refreshDecorations();

		const changeAction = 'Change Replacement Text';
		const action = await vscode.window.showInformationMessage(
			`Text will be replaced with "${replacementText}". You can change this in settings.`,
			changeAction
		);

		if (action === changeAction) {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'mask.replacementText');
		}
	});

	let unmarkMasked = vscode.commands.registerCommand('mask.unmarkMasked', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selection = editor.selection;
		const fileUri = editor.document.uri.toString();
		const ranges = maskedRanges.get(fileUri) || [];
		
		const newRanges: vscode.Range[] = [];
		
		for (const range of ranges) {
			const intersection = range.intersection(selection);
			if (!intersection) {
				// No intersection, keep the original range
				newRanges.push(range);
			} else {
				// There is intersection, need to split the range
				const originalReplacementText = customReplacements.get(range.toString() + fileUri) || '[***]';
				
				// Remove the original range's replacement text
				customReplacements.delete(range.toString() + fileUri);
				
				// Check if there's a part before the intersection
				if (range.start.isBefore(selection.start)) {
					const beforeRange = new vscode.Range(range.start, selection.start);
					newRanges.push(beforeRange);
					customReplacements.set(beforeRange.toString() + fileUri, originalReplacementText);
				}
				
				// Check if there's a part after the intersection
				if (selection.end.isBefore(range.end)) {
					const afterRange = new vscode.Range(selection.end, range.end);
					newRanges.push(afterRange);
					customReplacements.set(afterRange.toString() + fileUri, originalReplacementText);
				}
				
				// The intersection part is removed (not added to newRanges)
			}
		}
		
		maskedRanges.set(fileUri, newRanges);

		saveMasksToFile();
		refreshDecorations();
	});

	let changeReplacementText = vscode.commands.registerCommand('mask.changeReplacementText', async () => {
		const currentText = context.workspaceState.get<string>('mask.lastUsedText') || '[***]';
		
		const newText = await vscode.window.showInputBox({
			prompt: 'Enter new replacement text for masked code',
			placeHolder: 'e.g., [***], [API_KEY], etc.',
			value: currentText
		});

		if (newText) {
			await context.workspaceState.update('mask.lastUsedText', newText);
			vscode.window.showInformationMessage(`Replacement text updated to "${newText}"`);
		}
	});

	let findAllReferencesAndExpand = vscode.commands.registerCommand('mask.findAllReferencesAndExpand', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found');
			return;
		}

		// Store current position
		const originalPosition = editor.selection.active;
		const originalDocument = editor.document;

		try {
			// Execute Find All References
			await vscode.commands.executeCommand('references-view.findReferences', editor.document.uri, originalPosition);
			
			// Wait a bit for the references to be found and displayed
			await new Promise(resolve => setTimeout(resolve, 500));

			// Get reference locations
			const locations = await vscode.commands.executeCommand('vscode.executeReferenceProvider', 
				editor.document.uri, originalPosition) as vscode.Location[];

			if (!locations || locations.length === 0) {
				vscode.window.showInformationMessage('No references found');
				return;
			}

			vscode.window.showInformationMessage(`Found ${locations.length} references, expanding all...`);

			// Navigate through each reference to expand the References panel
			for (let i = 0; i < locations.length; i++) {
				try {
					await vscode.commands.executeCommand('references-view.next');
					// Small delay to allow the UI to update
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (error) {
					// If references-view.next fails, try goToNextReference as fallback
					try {
						await vscode.commands.executeCommand('goToNextReference');
						await new Promise(resolve => setTimeout(resolve, 100));
					} catch (fallbackError) {
						console.log('Failed to navigate to next reference:', fallbackError);
					}
				}
			}

			// Return to original position
			const originalEditor = vscode.window.visibleTextEditors.find(e => e.document === originalDocument);
			if (originalEditor) {
				await vscode.window.showTextDocument(originalDocument);
				originalEditor.selection = new vscode.Selection(originalPosition, originalPosition);
				originalEditor.revealRange(new vscode.Range(originalPosition, originalPosition));
			}

			vscode.window.showInformationMessage('All references expanded successfully!');

		} catch (error) {
			console.error('Error in findAllReferencesAndExpand:', error);
			vscode.window.showErrorMessage(`Error expanding references: ${error}`);
		}
	});

	let clearAllMask = vscode.commands.registerCommand('mask.clearAllMask', async (uri?: vscode.Uri) => {
		try {
			let targetPath: string;
			
			// If called from context menu, uri will be provided
			if (uri) {
				targetPath = uri.fsPath;
			} else {
				// If called from command palette, use workspace folder
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder found');
					return;
				}
				targetPath = workspaceFolder.uri.fsPath;
			}

			// Confirm with user
			const answer = await vscode.window.showWarningMessage(
				`This will remove ALL mask data from files in "${path.basename(targetPath)}" and its subdirectories. This action cannot be undone.`,
				{ modal: true },
				'Clear All Masks',
				'Cancel'
			);

			if (answer !== 'Clear All Masks') {
				return;
			}

			// Show progress
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Clearing all masks',
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 0, message: 'Loading mask storage...' });

				// Load current storage
				const storageFilePath = getStorageFilePath();
				let storage: MaskStorage = {};
				
				if (fs.existsSync(storageFilePath)) {
					const data = fs.readFileSync(storageFilePath, 'utf8');
					storage = JSON.parse(data);
				}

				progress.report({ increment: 20, message: 'Analyzing files...' });

				// Get all file URIs in the storage that are within the target directory
				const filesToClear: string[] = [];
				
				for (const fileUri of Object.keys(storage)) {
					try {
						const uri = vscode.Uri.parse(fileUri);
						const filePath = uri.fsPath;
						
						// Check if file is within the target directory
						const relativePath = path.relative(targetPath, filePath);
						if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
							filesToClear.push(fileUri);
						}
					} catch (error) {
						console.error(`Error processing URI ${fileUri}:`, error);
					}
				}

				if (filesToClear.length === 0) {
					vscode.window.showInformationMessage('No masked files found in the selected directory');
					return;
				}

				progress.report({ increment: 40, message: `Clearing masks from ${filesToClear.length} files...` });

				// Remove entries from storage
				let clearedCount = 0;
				for (const fileUri of filesToClear) {
					delete storage[fileUri];
					
					// Also clear from in-memory cache
					maskedRanges.delete(fileUri);
					
					// Clear custom replacement texts
					const ranges = maskedRanges.get(fileUri) || [];
					for (const range of ranges) {
						customReplacements.delete(range.toString() + fileUri);
					}
					
					clearedCount++;
					progress.report({ 
						increment: (40 / filesToClear.length), 
						message: `Cleared ${clearedCount}/${filesToClear.length} files...` 
					});
				}

				progress.report({ increment: 80, message: 'Saving changes...' });

				// Save updated storage
				fs.writeFileSync(storageFilePath, JSON.stringify(storage, null, 2));

				progress.report({ increment: 100, message: 'Complete!' });

				// Refresh decorations for currently open editors
				refreshDecorations();

				vscode.window.showInformationMessage(
					`Successfully cleared masks from ${clearedCount} files in "${path.basename(targetPath)}"`
				);
			});

		} catch (error) {
			console.error('Error in clearAllMask:', error);
			vscode.window.showErrorMessage(`Error clearing masks: ${error}`);
		}
	});

	// Handle copy operations
	let copyHandler = vscode.commands.registerTextEditorCommand('editor.action.clipboardCopyAction', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selection = editor.selection;
		const fileUri = editor.document.uri.toString();
		const ranges = maskedRanges.get(fileUri) || [];
		const selectedText = editor.document.getText(selection);

		const intersectingRanges = ranges.filter(range => range.intersection(selection));
		if (intersectingRanges.length > 0) {
			let finalText = selectedText;
			
			// for (const range of intersectingRanges) {
			// 	const intersection = range.intersection(selection);
			// 	if (intersection) {
			// 		const customText = customReplacements.get(range.toString() + fileUri);
			// 		const replacementText = customText || 
			// 			vscode.workspace.getConfiguration('mask').get<string>('replacementText') || 
			// 			'[***]';

			// 		const intersectionText = editor.document.getText(intersection);
			// 		finalText = finalText.replace(intersectionText, replacementText);
			// 	}
			// }
			
			await vscode.env.clipboard.writeText(finalText);
			return;
		}

		await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
	});

	let copyWithSyntaxHandler = vscode.commands.registerTextEditorCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const selection = editor.selection;
		const fileUri = editor.document.uri.toString();
		const ranges = maskedRanges.get(fileUri) || [];
		const selectedText = editor.document.getText(selection);

		const intersectingRanges = ranges.filter(range => range.intersection(selection));
		if (intersectingRanges.length > 0) {
			let finalText = selectedText;
			
			// for (const range of intersectingRanges) {
			// 	const intersection = range.intersection(selection);
			// 	if (intersection) {
			// 		const customText = customReplacements.get(range.toString() + fileUri);
			// 		const replacementText = customText || 
			// 			vscode.workspace.getConfiguration('mask').get<string>('replacementText') || 
			// 			'[***]';

			// 		const intersectionText = editor.document.getText(intersection);
			// 		finalText = finalText.replace(intersectionText, replacementText);
			// 	}
			// }
			
			await vscode.env.clipboard.writeText(finalText);
			return;
		}

		await vscode.env.clipboard.writeText(selectedText);
	});

	context.subscriptions.push(
		markMasked, 
		unmarkMasked, 
		changeReplacementText,
		findAllReferencesAndExpand,
		clearAllMask,
		copyHandler,
		copyWithSyntaxHandler,
		vscode.window.onDidChangeActiveTextEditor(() => {
			loadMasksFromFile();
			refreshDecorations();
		}),
		vscode.workspace.onDidOpenTextDocument(() => {
			loadMasksFromFile();
			refreshDecorations();
		}),
		vscode.workspace.onDidSaveTextDocument((document) => {
			const fileUri = document.uri.toString();
			const ranges = maskedRanges.get(fileUri);
			
			// Only update metadata if this file has mask ranges
			if (ranges && ranges.length > 0) {
				// Update metadata for this specific file
				const filePath = document.uri.fsPath;
				const metadata = calculateFileMetadata(filePath);
				
				if (metadata) {
					// Save the masks with updated metadata
					saveMasksToFile();
				}
			}
		})
	);
}

function updateDecorationStyle() {
	if (maskDecoration) {
		maskDecoration.dispose();
	}

	const config = vscode.workspace.getConfiguration('mask');
	const decorationColor = config.get<string>('decorationColor') || '#ff000033';

	maskDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: '#343434',
		// border: '1px dashed gray',
		overviewRulerColor: 'green',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
	});
}

function refreshDecorations() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const fileUri = editor.document.uri.toString();
	const ranges = maskedRanges.get(fileUri) || [];
	editor.setDecorations(maskDecoration, ranges);
}

export function deactivate() {
	if (maskDecoration) {
		maskDecoration.dispose();
	}
}
