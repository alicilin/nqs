import { Request, Subscriber } from 'zeromq';
import { pack, unpack } from 'msgpackr';
import { EventEmitter } from 'node:events';
import { createPublisher } from './Publisher.js';
import { debug } from 'node:util';
import joi from 'joi';
import _ from 'lodash';
//-----------------------------------------
const parser = ([msg]) => unpack(msg);
const logger = debug('mq:consumer');
const scheme = joi.object().required().keys(
    {
        connections: joi.array().required().length(2).items(
            joi.string().regex(/tcp:\/\/.+/i).required()
        ),
        secretKey: joi.string().required().min(1).max(100),
        service: joi.string().required().min(1).max(100),
        channel: joi.string().required().min(1).max(100),
    }
)
//-----------------------------------------
export class Consumer extends EventEmitter {
    constructor({ connections, service, channel, secretKey }) {
        super();
        let valid = { connections, service, channel, secretKey };
        let { error } = scheme.validate(valid);
        if (error) {
            throw error;
        }

        this.secretKey = secretKey;
        this.connections = connections;
        this.channel = channel;
        this.service = service;
        this.req = new Request();
        this.sub = new Subscriber();
        this.req.connect(connections[0]);
        this.sub.connect(connections[1]);
        this.publisher = createPublisher({ addr: connections[0], secretKey });
        logger('connected to reply server:', connections[0]);
        logger('connected to pub server:', connections[1]);
    }

    async connect() {
        for (let name of this.eventNames()) {
            this.sub.subscribe(`${this.service}:${this.channel}:${name}`);
        }

        let register = {
            type: 'REGISTER',
            key: this.secretKey,
            data: {
                channel: this.channel,
                service: this.service
            }
        }

        //--------------------------------------------------------
        await this.req.send(pack(register));
        //--------------------------------------------------------
        let { type, data } = await this.req.receive().then(parser);
        if (type === 'ERROR') {
            throw new Error(data);
        }

        let loop = async () => {
            for await (let [t, message] of this.sub) {
                try {
                    let sending = pack(
                        {
                            type: 'PULL',
                            data: unpack(message),
                            key: this.secretKey
                        }
                    )
                    //-----------------------------------------------------
                    await this.req.send(sending);
                    logger('new task notification');
                    //-----------------------------------------------------
                    let { type, data } = await this.req.receive().then(parser);
                    if (type === 'ERROR') {
                        logger('fetch task error: %s', data);
                    }

                    if (data === null) {
                        logger('task not found. skipping');
                        continue;
                    }

                    let executor = (done, reject) => {
                        super.emit(data['event'], data['message'], done, reject);
                    }

                    try {
                        await new Promise(executor);
                        logger('process success. fetch next task');
                    } catch (error) {
                        let sending = { ...data, receiver: [data['receiver']] }
                        await this.publisher.publish(sending);
                        logger('process failed. returned');
                    }
                } catch (error) {
                    logger('process error: %s', error.message);
                }
            }
        }

        loop();
    }
}