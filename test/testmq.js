import { bind } from '../MessageQueue/Server.js';
import { Consumer } from '../MessageQueue/Consumer.js';
import { createPublisher, PublishParams } from '../MessageQueue/Publisher.js';
import { setTimeout } from 'node:timers/promises';
import { SQLite } from '../stores.js';
//------------------- bu ayrı servis Message queue server-------------------------------
const connections = ['tcp://127.0.0.1:5000', 'tcp://127.0.0.1:5001'];
await bind({ connections, store: SQLite({ filename: './test.sqlite' }), secretKey: '12345' });
//---------------------------------------------------

//-----------------------------------------ayrı servis-----------------------------------------------------
let puller = new Consumer({ connections, channel: 'test', service: 'test', secretKey: '12345' });
puller.on('test-event', (message, done, reject) => {
    console.log(message, 'puller 1');
    done();
    //reject();
});

//--------------------------------------ayrı servis
let puller2 = new Consumer({ connections, channel: 'test', service: 'test', secretKey: '12345' });
puller2.on('test-event', (message, done, reject) => {
    console.log(message, 'puller 2');
    done()
    //reject();
});

await puller.connect();
await puller2.connect();

//----------------- bu publisher ayrı servis-----------------------------------
let { publish, cancel } = createPublisher({ addr: connections[0], secretKey: '12345' });
for (let i = 0; i < 100; i++) {
    await setTimeout(1000);
    await publish(
        new PublishParams()
            .setKey(`testto:${i}`)
            .setSender('testto')
            .setReceiver(['test'])
            .setChannel('test')
            .setEvent('test-event')
            .setMessage('heyo babaaaaaa')
            .setDate('+10')
    );

    //await cancel(`testto:${i}`);
    // await publish({ sender: 'testtto', receiver: ['test'], channel: 'test', event: 'test-event', message: `10 saniye sonra` });
}



console.log('ok');