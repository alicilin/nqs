import joi from 'joi';
//---------------------------
const schemes = {
    MySQL: joi.object().required().keys(
        {
            host: joi.string().required(),
            port: joi.number().integer().required(),
            user: joi.string().required(),
            password: joi.string().allow(null).required(),
            database: joi.string().required()
        }
    ),
    SQLite: joi.object().required().keys(
        {
            filename: joi.string().required()
        }
    )
}

export function MySQL({ host, port, user, password, database }) {
    let { error } = schemes.MySQL.validate({ host, port, user, password, database });
    if (error) {
        throw error;
    }

    let options = {
        client: 'mysql2',
        connection: { host, port, user, password, database },
        useNullAsDefault: true,
        pool: {
            min: 3,
            max: 100
        }
    }

    return { driver: 'MySQL', options };
}

export function SQLite({ filename }) {
    let { error } = schemes.SQLite.validate({ filename });
    if (error) {
        throw error;
    }
    
    let options = {
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: { filename }
    }

    return { driver: 'SQLite', options };
}