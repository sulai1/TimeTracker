import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { connect } from '../database/database';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	test('Sample test', async () => {
		const client = await connect({
			user: 'postgres',
			host: '192.168.0.6',
			database: 'tracker',
			password: 'sbg631587'
		});
		assert.ok(client);
		client.migrate('1.0.0');
	});
});
