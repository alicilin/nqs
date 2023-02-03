/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
    return knex.schema.createTable('consumers', table => {
        table.bigIncrements('id').unsigned().primary();
        table.string('service', 100).notNullable();
        table.string('channel', 100).notNullable().index();

        table.unique(['service', 'channel']);
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
    return knex.schema.dropTable('consumers');
}