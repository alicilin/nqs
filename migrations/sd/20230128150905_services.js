/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
    return knex.schema.createTable('services', table => {
        table.bigIncrements('id').unsigned().primary();
        table.string('name', 100).notNullable().index();
        table.string('http_endpoint', 100).notNullable();
        table.string('check_endpoint', 100).notNullable();
        table.timestamp('last_update').notNullable();
        table.enum('status', ['UP', 'DOWN']).index();
        table.string('auth', 100).nullable();
        table.json('headers').nullable();

        table.unique(['name', 'http_endpoint']);
        table.index(['name', 'status']);
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
    return knex.schema.dropTable('services');
}