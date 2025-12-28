const migration = require('./migrations/003_create_shifts_tables');

async function runMigration() {
    try {
        console.log('🚀 Running shifts migration...');
        await migration.up();
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
