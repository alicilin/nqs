const config = {
    client: 'sqlite3',
    migrations: {
        directory: './migrations'
    },
    connection: {
        filename: './temp.db'
    }
};

export default config;
export const { client, migrations, connection } = config;