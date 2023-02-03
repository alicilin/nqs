import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { debug } from 'node:util';
//--------------------------------------------------
const powered = 'SQD Apex Service Discovery';
const logger = debug('sd:proxy');
//--------------------------------------------------
export async function proxy(sreq, sres, { target, auth = undefined, headers }) {
    let url = new URL(target);
    let requester = url.protocol === 'https:' ? https : http;
    let hostname = url.hostname;
    let port = url.port;
    let path = url.pathname + url.search;
    let method = sreq.method;
    let protocol = url.protocol;
    //-------------------------------
    headers = { ...sreq.headers, ...(headers || {}), host: url.hostname, 'x-powered-by': powered }
    //-------------------------------
    let options = { protocol, hostname, port, path, method, auth, headers }
    let rcb = res => {
        logger('proxy response %s. status code: %s', target, res.statusCode);
        sres.writeHead(res.statusCode, { ...res.headers, 'x-powered-by': powered });
        res.pipe(sres, { end: true });
    }

    let ecb = err => {
        logger('proxy response %s. error: %s', target, err.message);
        sres.writeHead(400, { 'content-type': 'application/json' });
        sres.end(`{"success": false, "message": "${err.message}"}`);
    }

    logger('start proxy: %s', target);
    let proxy = requester.request(options, rcb);
    proxy.on('error', ecb);
    sreq.pipe(proxy, { end: true });
    return true;
}