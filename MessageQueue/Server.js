import { Reply, Publisher } from 'zeromq';
import { pack, unpack } from 'msgpackr';
import { setTimeout as sleep } from 'node:timers/promises';
import { stc } from '../helpers/stc.js';
import { debug } from 'node:util';
import Knex from 'knex';
import moment from 'moment-timezone';
import joi from 'joi';
import _ from 'lodash';
//----------------------------------------------------------
const logger = debug('mq:server');
const schemes = {
    bind: joi.object().required().keys(
        {
            connections: joi.array().required().length(2).items(
                joi.string().regex(/tcp:\/\/.+/i).required()
            ),
            store: joi.any().required(),
            secretKey: joi.string().required().min(1).max(100)
        }
    ),
    register: joi.object().required().keys(
        {
            service: joi.string().max(100).min(1).required(),
            channel: joi.string().max(100).min(1).required()
        }
    ),
    cancel: joi.string().optional().min(1).max(100),
    pull: joi.array().length(3).required().items(
        joi.string().min(1).max(100).required()
    ),
    push: joi.object().required().keys(
        {
            id: joi.number().integer().allow(null).optional(),
            key: joi.string().optional().max(100).allow(null),
            channel: joi.string().required().max(100).min(1),
            sender: joi.string().required().max(100).min(1),
            receiver: joi.alternatives(
                joi.string().required().valid('*'),
                joi.array().min(1).required().items(
                    joi.string().required().max(100).min(1).not('*')
                )
            ),
            event: joi.string().required().max(100).min(1),
            message: joi.any().required(),
            date: joi.alternatives(
                joi.string().regex(/\^\+[0-9]{1,15}$/i).required(),
                joi.date().timestamp('javascript').required(),
                joi.date().timestamp('unix').required()
            )
        }
    )
}
//----------------------------------------------------------
export async function bind({ connections, store, secretKey }) {
    await schemes.bind.validateAsync({ connections, store, secretKey });
    //------------------------------------------------------------------
    let rep = new Reply();
    let pub = new Publisher();
    let { options, driver } = store;
    let knex = Knex(options);
    //-----------------------------------------------------------------
    await rep.bind(connections[0]);
    await pub.bind(connections[1]);
    await knex.migrate.latest({ directory: '../migrations/MQ' });
    await knex('consumers').delete();
    //-----------------------------------------------------------------
    logger('bind reply server: %s', connections[0]);
    logger('bind push server: %s', connections[1]);
    //-----------------------------------------------------------------
    let register = async data => {
        await schemes.register.validateAsync(data);
        //-----------------------------------------------------------------
        let { service, channel } = data;
        let conflict = ['service', 'channel'];
        let insert = { service, channel };
        //-----------------------------------------------------------------
        logger('register consumer. service: %s,  channel: %s', service, channel);
        //-----------------------------------------------------------------
        await knex('consumers').insert(insert).onConflict(conflict).ignore();
        await rep.send(pack({ type: 'SUCCESS' }));
    }

    let pull = async ([receiver, channel, event]) => {
        await schemes.pull.validateAsync([receiver, channel, event]);
        //-------------------------------------------------------------------------
        let knexi = knex('queue');
        //-------------------------------------------------------------------------
        knexi.where('receiver', receiver);
        knexi.where('channel', channel);
        knexi.where('event', event);
        knexi.where('date', '<', moment().unix());
        knexi.orderBy('id', 'asc');
        //------------------------------------------------------------------------
        let row = await knexi.first();
        if (!row) {
            return await rep.send(pack({ type: 'SUCCESS', data: null }));
        }

        let lock = await stc(() => knex('locks').insert({ key: `task:${row['id']}` }));
        if (_.isError(lock)) {
            return await rep.send(pack({ type: 'SUCCESS', data: null }));
        }

        let data = { ...row, message: unpack(row['message']) }
        let message = pack({ type: 'SUCCESS', data });
        //----------------------------------------------------------------------
        await rep.send(message);
        await knex('queue').where('id', row['id']).delete();
        await knex('locks').where('key', `task:${row['id']}`).delete();
        //----------------------------------------------------------------------
        logger('send queue task. %s, %s, %s', receiver, channel, event);
        //----------------------------------------------------------------------
        if (driver === 'SQLite') {
            await knex.raw('VACUUM');
        }
    }

    let push = async data => {
        await schemes.push.validateAsync(data);
        //-----------------------------------------------------------------
        let unixt = data['date'];
        if (_.isNil(unixt)) {
            unixt = moment().subtract(10, 'minute').unix();
        }

        if (_.startsWith(unixt, '+')) {
            unixt = moment().add(unixt.slice(1), 'second').unix();
        }

        if (_.isString(unixt)) {
            unixt = moment(unixt).unix();
        }

        if (_.isDate(data['date'])) {
            unixt = moment(unixt).unix();
        }

        if (!_.isInteger(unixt)) {
            throw new Error('DELAY_IS_NOT_DATE');
        }

        let messages = [];
        if (_.isArray(data['receiver'])) {
            for (let receiver of data['receiver']) {
                let message = {
                    key: data['key'] || Math.round(Math.random() * 1000),
                    channel: data['channel'],
                    sender: data['sender'],
                    receiver: receiver,
                    event: data['event'],
                    message: pack(data['message']),
                    date: unixt
                }

                messages.push(message);
            }
        }

        if (data['receiver'] === '*') {
            let knexi = knex('consumers');
            //-------------------------------------------
            knexi.where('channel', data['channel']);
            //-------------------------------------------
            let receivers = await knexi.pluck('service');
            //-------------------------------------------
            for (let receiver of receivers) {
                let message = {
                    key: data['key'] || Math.round(Math.random() * 1000),
                    channel: data['channel'],
                    sender: data['sender'],
                    receiver: receiver,
                    event: data['event'],
                    message: pack(data['message']),
                    date: unixt
                }

                messages.push(message);
            }
        }

        await knex('queue').insert(messages);
        await rep.send(pack({ type: 'SUCCESS' }));
    }

    let cancel = async key => {
        await schemes.cancel.validateAsync(key);
        await knex('queue').where('key', 'like', key).delete();
        await rep.send(pack({ type: 'SUCCESS' }));
        logger('cancel task. key: %s', key);
    }
    //------------------------------
    let loop = async () => {
        for await (let [msg] of rep) {
            try {
                let { type, data, key } = unpack(msg);
                if (key !== secretKey) {
                    throw new Error('INVALID_SECRET_KEY');
                }

                switch (type) {
                    case 'REGISTER':
                        await register(data);
                        break;
                    case 'PULL':
                        await pull(data);
                        break;
                    case 'PUSH':
                        await push(data);
                        break;
                    case 'CANCEL':
                        await cancel(data);
                        break;
                }
            } catch (error) {
                logger('error: %s', error.message);
                rep.send(pack({ type: 'ERROR', data: error.message }));
            }
        }
    }

    let publisher = async () => {
        while (true) {
            try {
                let knexi = knex('queue');
                //-----------------------------------------
                knexi.where('date', '<=', moment().unix());
                knexi.groupBy(['receiver', 'channel', 'event']);
                //----------------------------------------
                let stream = knexi.select('receiver', 'channel', 'event').stream();
                //----------------------------------------
                for await (let { receiver, channel, event } of stream) {
                    let topic = `${receiver}:${channel}:${event}`;
                    let message = pack([receiver, channel, event]);
                    //---------------------------------------------
                    logger('send notification to workers: %s', topic);
                    pub.send([topic, message]);
                }

                await sleep(800);
            } catch (error) {
                logger('send notification to workers failed: %s', error.message);
            }
        }
    }

    loop();
    publisher();
}