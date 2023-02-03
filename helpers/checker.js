import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { debug } from 'node:util';
//---------------------------------
const logger = debug('sd:checker');
//---------------------------------
export async function checker({ target, auth = undefined, headers }) {
    let url = new URL(target);
    let requester = url.protocol === 'https:' ? https : http;
    let hostname = url.hostname;
    let port = url.port;
    let path = url.pathname + url.search;
    let method = 'GET';
    let protocol = url.protocol;
    //----------------------------------------------------------
    headers = { host: url.hostname, ...(headers || {}) }
    //----------------------------------------------------------
    let options = { protocol, hostname, port, path, method, timeout: 10, auth, headers }
    let pr = (resolve, reject) => {
        let requestcb = async res => {
            if (res.statusCode >= 300) {
                logger('%s failed. Status code %s', target, res.statusCode);
                return reject(new Error('ERROR.INVALID_STATUS_CODE'));
            }
            
            logger('%s success. Status code %s', target, res.statusCode);
            res.destroy('ok');
            resolve(true);
        }

        let req = requester.request(options, requestcb);
        req.on('error', e => reject(e.message));
        req.end();
    }

    return new Promise(pr);
}