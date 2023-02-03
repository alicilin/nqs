import { URL } from 'node:url';
import joi from 'joi';
//------------------------------------------
const replacer = /\/$/ig;
const schemes = {
    constructor: joi.object(
        {
            hostname: joi.string().uri().required(),
            user: joi.string().required().min(1).max(100),
            password: joi.string().required().min(1).max(100)
        }
    ),
    transform: joi.string().required().uri()
}
//------------------------------------------
export class Transformer {
    constructor(hostname, user, password) {
        let validating = { hostname, user, password }
        let { error } = schemes.constructor.validate(validating);
        if (error) {
            throw error;
        }

        this.hostname = hostname;
        this.user = user;
        this.password = password;
    }

    transform(str) {
        let { error } = schemes.transform.validate(str);
        if (error) {
            throw error;
        }
        
        //---------------------------------------------------------------------
        let CURL = new URL(str);
        let PURL = new URL(this.hostname);
        //---------------------------------------------------------------------
        PURL['username'] = this.user;
        PURL['password'] = this.password;
        PURL['search'] = CURL['search'];
        PURL['pathname'] = `/request/${CURL['hostname']}${CURL['pathname']}`;
        //----------------------------------------------------------------
        return PURL['href'].replace(replacer, '');
    }
}