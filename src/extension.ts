import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const maskedRanges = new Map<string, vscode.Range[]>();
const customReplacements = new Map<string, string>();
let maskDecoration: vscode.TextEditorDecorationType;

interface MaskData {
	ranges: Array<{
		start: { line: number; character: number };
		end: { line: number; character: number };
		replacementText: string;
	}>;
}

interface MaskStorage {
	[filePath: string]: MaskData;
}

function getStorageFilePath(): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return path.join(require('os').homedir(), '.vscode-mask-storage.json');
	}
	
	const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
	if (!fs.existsSync(vscodeDir)) {
		fs.mkdirSync(vscodeDir, { recursive: true });
	}
	
	return path.join(vscodeDir, 'mask-storage.json');
}

function saveMasksToFile() {
	try {
		const storage: MaskStorage = {};
		
		for (const [fileUri, ranges] of maskedRanges.entries()) {
			const maskData: MaskData = {
				ranges: ranges.map(range => ({
					start: { line: range.start.line, character: range.start.character },
					end: { line: range.end.line, character: range.end.character },
					replacementText: customReplacements.get(range.toString() + fileUri) || '[***]'
				}))
			};
			storage[fileUri] = maskData;
		}
		
		const storageFilePath = getStorageFilePath();
		fs.writeFileSync(storageFilePath, JSON.stringify(storage, null, 2));
	} catch (error) {
		console.error('Failed to save masks:', error);
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
		customReplacements.clear();
		
		for (const [fileUri, maskData] of Object.entries(storage)) {
			const ranges = maskData.ranges.map(rangeData => {
				const range = new vscode.Range(
					new vscode.Position(rangeData.start.line, rangeData.start.character),
					new vscode.Position(rangeData.end.line, rangeData.end.character)
				);
				customReplacements.set(range.toString() + fileUri, rangeData.replacementText);
				return range;
			});
			maskedRanges.set(fileUri, ranges);
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
		ranges.push(range);
		maskedRanges.set(fileUri, ranges);
		customReplacements.set(range.toString() + fileUri, replacementText);

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
		
		const removedRanges = ranges.filter(range => range.intersection(selection));
		const newRanges = ranges.filter(range => !range.intersection(selection));
		maskedRanges.set(fileUri, newRanges);

		removedRanges.forEach(range => {
			customReplacements.delete(range.toString() + fileUri);
		});

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
		copyHandler,
		copyWithSyntaxHandler,
		vscode.window.onDidChangeActiveTextEditor(() => {
			loadMasksFromFile();
			refreshDecorations();
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
		backgroundColor: '#4D4D4D',
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
