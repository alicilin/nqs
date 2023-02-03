/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
    return knex.schema.createTable('queue', table => {
        table.bigIncrements('id').primary();
        table.string('key', 100).notNullable().index();
        table.string('channel', 100).notNullable();
        table.string('sender', 100).notNullable();
        table.string('receiver', 100).notNullable();
        table.string('event', 100).notNullable();
        table.binary('message');
        table.integer('date').notNullable().index();

        table.index(['date', 'receiver', 'channel', 'event']);
        table.index(['receiver', 'channel', 'event', 'date', 'id']);
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
    return knex.schema.dropTable('queue');
}