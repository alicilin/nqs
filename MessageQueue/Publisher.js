import { Request } from 'zeromq';
import { pack, unpack } from 'msgpackr';
import { debug } from 'node:util';
import joi from 'joi';
import _ from 'lodash';
//---------------------------------------
const logger = debug('mq:publisher');
const schemes = {
    connect: joi.object().required().keys(
        {
            addr: joi.string().regex(/tcp:\/\/.+/i).required(),
            secretKey: joi.string().required().min(1).max(100)
        }
    ),
    cancel: joi.string().optional().min(1).max(100),
    publish: joi.object().required().keys(
        {
            key: joi.string().optional().max(100).allow(null),
            channel: joi.string().required().max(100).min(1),
            sender: joi.string().required().max(100).min(1),
            receiver: joi.alternatives(
                joi.string().required().allow('*'),
                joi.array().min(1).items(
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
//---------------------------------------
async function publish({ addr, secretKey }, options) {
    if (options instanceof PublishParams) {
        options = options['value'];
    }

    await schemes.publish.validateAsync(options);
    //-----------------------------------------------
    let req = new Request();
    try {
        let msg = {
            type: 'PUSH',
            data: options,
            key: secretKey
        }

        req.connect(addr);
        req.send(pack(msg));
        logger('published');
        //---------------------
        let [res] = await req.receive();
        let { type, data } = unpack(res);
        if (type === 'ERROR') {
            throw new Error(data);
        }

        return true;
    } catch (error) {
        throw error;
    } finally {
        req.close();
    }
}

async function cancel({ addr, secretKey }, key) {
    await schemes.cancel.validateAsync(key);
    //----------------------------------------
    let req = new Request();
    try {
        let msg = {
            type: 'CANCEL',
            data: key,
            key: secretKey
        }

        req.connect(addr);
        req.send(pack(msg));
        logger('cancel request sent');
        //---------------------
        let [res] = await req.receive();
        let { type, data } = unpack(res);
        if (type === 'ERROR') {
            throw new Error(data);
        }

        return true;
    } catch (error) {
        throw error;
    } finally {
        req.close();
    }
}

export function createPublisher({ addr, secretKey }) {
    let { connect } = schemes;
    let { error } = connect.validate({ addr, secretKey });
    if (error) {
        throw error;
    }

    logger('connect publisher: %s', addr);
    return {
        publish: publish.bind(this, { addr, secretKey }),
        cancel: cancel.bind(this, { addr, secretKey })
    }
}

export class PublishParams {
    constructor(value) {
        this.value = value || {};
    }

    setKey(value) {
        this.value['key'] = value;
        return this;
    }

    setChannel(value) {
        this.value['channel'] = value;
        return this;
    }

    setSender(value) {
        this.value['sender'] = value;
        return this;
    }

    setReceiver(value) {
        this.value['receiver'] = value;
        return this;
    }

    setEvent(value) {
        this.value['event'] = value;
        return this;
    }

    setMessage(value) {
        this.value['message'] = value;
        return this;
    }

    setDate(value) {
        this.value['date'] = value;
        return this;
    }

    clone() {
        return new PublishParams(
            _.cloneDeep(this.value)
        )
    }
}