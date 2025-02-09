import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('mask'));
	});

	test('Should mark text as uncopyable', async () => {
		// Create a test document
		const document = await vscode.workspace.openTextDocument({
			content: 'API_KEY=test123\nNormal text',
			language: 'text'
		});
		const editor = await vscode.window.showTextDocument(document);

		// Select the API key line
		const position = new vscode.Position(0, 0);
		editor.selection = new vscode.Selection(position, position.translate(0, 13));

		// Simulate marking as uncopyable
		await vscode.commands.executeCommand('mask.markUncopyable');

		// Wait for decorations to be applied
		await new Promise(resolve => setTimeout(resolve, 100));

		// Try to copy the text (this is a basic check since we can't fully simulate copying)
		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		const clipboardText = await vscode.env.clipboard.readText();
		
		// Should be replaced with default text
		assert.strictEqual(clipboardText, '[***]');
	});

	test('Should unmark text', async () => {
		// Create a test document
		const document = await vscode.workspace.openTextDocument({
			content: 'SECRET=abc123\nNormal text',
			language: 'text'
		});
		const editor = await vscode.window.showTextDocument(document);

		// Select the secret line
		const position = new vscode.Position(0, 0);
		editor.selection = new vscode.Selection(position, position.translate(0, 12));

		// Mark as uncopyable
		await vscode.commands.executeCommand('mask.markUncopyable');
		await new Promise(resolve => setTimeout(resolve, 100));

		// Unmark the text
		await vscode.commands.executeCommand('mask.unmarkUncopyable');
		await new Promise(resolve => setTimeout(resolve, 100));

		// Try to copy the text
		await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
		const clipboardText = await vscode.env.clipboard.readText();
		
		// Should be the original text
		assert.strictEqual(clipboardText, 'SECRET=abc123');
	});

	test('Should use custom replacement text', async () => {
		// Create a test document
		const document = await vscode.workspace.openTextDocument({
			content: 'PASSWORD=mypass123\nNormal text',
			language: 'text'
		});
		const editor = await vscode.window.showTextDocument(document);

		// Select the password line
		const position = new vscode.Position(0, 0);
		editor.selection = new vscode.Selection(position, position.translate(0, 16));

		// Mock the input box to return custom replacement text
		const originalShowInputBox = vscode.window.showInputBox;
		vscode.window.showInputBox = async () => '[PASSWORD]';

		try {
			// Mark as uncopyable with custom text
			await vscode.commands.executeCommand('mask.markUncopyable');
			await new Promise(resolve => setTimeout(resolve, 100));

			// Try to copy the text
			await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
			const clipboardText = await vscode.env.clipboard.readText();
			
			// Should be the custom replacement text
			assert.strictEqual(clipboardText, '[PASSWORD]');
		} finally {
			// Restore original showInputBox
			vscode.window.showInputBox = originalShowInputBox;
		}
	});
});
