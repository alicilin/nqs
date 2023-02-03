import { checker } from '../helpers/checker.js';
import { proxy } from '../helpers/proxy.js';
import { setTimeout } from 'node:timers/promises';
import { debug } from 'node:util';
import cluster from 'node:cluster';
import Knex from 'knex';
import express from 'express';
import basicAuth from 'express-basic-auth';
import moment from 'moment-timezone';
import _ from 'lodash';
import joi from 'joi';
//-----------------------------------------------------
const logger = debug('sd:server');
const schemes = {
    bind: joi.object().required().keys(
        {
            port: joi.number().integer().required(),
            store: joi.any().required(),
            workers: joi.number().integer().required(),
            user: joi.string().required().min(1).max(100),
            password: joi.string().required().min(1).max(100)
        }
    ),
    register: joi.object().required().keys(
        {
            name: joi.string().required().max(100).min(1),
            http_endpoint: joi.string().uri().required(),
            check_endpoint: joi.string().uri().required(),
            auth: joi.string().optional().allow(null).max(100).min(1),
            headers: joi.object().required().allow(null).unknown(true)
        }
    )
}
//-----------------------------------------------------
async function master({ store, workers = 2 }) {
    let knex = Knex(store['options']);
    //--------------------------------
    await knex.migrate.latest({ directory: '../migrations/SR' });
    await knex('services').update({ status: 'DOWN' });
    //--------------------------------
    for (let i = 0; i < workers; i++) {
        cluster.fork();
    }
    //--------------------------------------
    cluster.on('exit', () => cluster.fork());
    cluster.on('online', x => logger('worker %s online', x['process']['pid']));
    //---------------------------------------
    let loop = async () => {
        while (true) {
            let stream = knex('services').stream();
            logger('check services');
            for await (let { id, check_endpoint, auth, headers } of stream) {
                try {
                    if (_.isString(headers)) {
                        headers = JSON.parse(headers);
                    }

                    let update = { status: 'UP', last_update: moment().toDate() }
                    await checker({ target: check_endpoint, auth: auth || undefined, headers });
                    await knex('services').where('id', id).update(update);
                    logger('%s endpoint is accesible', check_endpoint);
                } catch (error) {
                    console.log(error);
                    let update = { status: 'DOWN', last_update: moment().toDate() }
                    await knex('services').where('id', id).update(update);
                    logger('%s endpoint is not accesible', check_endpoint);
                }
            }

            await setTimeout(3000);
        }
    }

    loop();
}

async function worker(port, { options }, user, password) {
    let app = express();
    let knex = Knex(options);
    let register = async (req, res) => {
        try {
            let body = await schemes.register.validateAsync(req['body']);
            //-------------------------------------------------------------------------------------------
            let check = {
                target: body['check_endpoint'],
                auth: body['auth'] || undefined,
                headers: body['headers']
            }

            //------------------------------------------------------------------------------------------
            body['last_update'] = moment().toDate();
            //------------------------------------------------------------------------------------------
            await checker(check);
            await knex('services').insert(body).onConflict(['name', 'http_endpoint']).merge();
            //-------------------------------------------------------------------------------------------
            logger('register / update service success: %s %s', body['name'], body['http_endpoint']);
            res.status(200).send({ success: true, message: body });
        } catch (error) {
            let params = [ body['name'], body['http_endpoint'], error.message ]
            logger('register / update service failed: %s %s. error message: %s ', ...params);
            res.status(500).send({ success: false, message: error.message });
        }
    }

    let servicelist = async (req, res) => {
        try {
            let services = await knex('services').select();
            for (let service of services) {
                if (_.isString(service['headers'])) {
                    service['headers'] = JSON.parse(service['headers']);
                }

                if (_.isInteger(service['last_update'])) {
                    service['last_update'] = moment(service['last_update']).toDate();
                }
            }

            res.status(200).send({ success: true, message: services });
        } catch (error) {
            res.status(500).send({ success: false, message: x.message })
        }
    }

    let request = async (req, res) => {
        try {
            let first = req.url.indexOf('/');
            let second = req.url.indexOf('/', first + 1);
            let name = req.url.slice(first + 1, second === -1 ? undefined : second);
            let path = req.url.slice(name.length + 1) || '/';
            if (_.isNil(name) || name === '') {
                throw new Error('ERROR.SERVICE_NOT_RESOLVED');
            }

            let services = await knex('services').where({ name, status: 'UP' }).select();
            if (_.size(services) === 0) {
                throw new Error('ERROR.NO_ACCESSIBLE_SERVICE_FOUND');
            }

            for (let service of _.shuffle(services)) {
                try {
                    let { http_endpoint, check_endpoint, auth, headers } = service;
                    if (_.isString(headers)) {
                        headers = JSON.parse(headers);
                    }

                    await checker({ target: check_endpoint, auth: auth || undefined, headers });
                    return proxy(req, res, { target: http_endpoint + path, auth: auth || undefined, headers });
                } catch (error) {
                    await knex('services').where('id', service['id']).update({ status: 'DOWN' });
                    continue;
                }
            }

            throw new Error('ERROR.SERVICE_UNAVAILABLE');
        } catch (error) {
            res.status(500).send({ success: false, message: error.message });
        }
    }

    //-----------------------------
    app.use('/', basicAuth({ users: { [user]: password } }));
    app.get('/services', servicelist);
    app.post('/register', express.json(), register);
    app.use('/request', request);
    app.listen(port);
}

export async function bind({ port, store, workers = 2, user, password }) {
    await schemes.bind.validateAsync({ port, store, workers, user, password });
    if (cluster.isPrimary) {
        return await master({ port, store, workers });
    }

    await worker(port, store, user, password);
}