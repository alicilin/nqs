# NQS

TCP & HTTP based, scalable, Message Queue and Service Discovery Library

## Installation

To install through npm

```bash
npm i @connectterou/nqs
```
## Message Queue

#### Message Queue Server

```javascript
// import the server
import { bind } from '@connectterou/nqs/MessageQueue/Server.js';
// choose a store type to store the messages
// vailable store types that you can use = SQLite, MySQL
import { SQLite } from '@connectterou/nqs/stores.js';
// The first value of the connections constant is the Req/Res address
// The second value of the connections constant is the Pub/Sub address
const connections = ['tcp://127.0.0.1:5000', 'tcp://127.0.0.1:5001'];
// We set a password for the security of the message queue server. The secretKey serves this purpose
await bind({ connections, store: SQLite({ filename: './test.db' }), secretKey: '12345' });
```

#### Message Queue Publisher

```javascript
import { createPublisher, PublishParams } from '@connectterou/nqs/MessageQueue/Publisher.js';
const connections = ['tcp://127.0.0.1:5000', 'tcp://127.0.0.1:5001'];
// Giving the first value of the connections constant as "addr" is enough. We don't need to connect to the PubSub server
const { publish, cancel } = createPublisher({ addr: connections[0], secretKey: '12345' });
await publish(
    new PublishParams()
        .setKey(`test:abc`) // Later, if you want to delete the message before processing, you will need the key. It is optional
        .setSender('testto') // The sender service identity (usually the service name is written)
        .setReceiver(['test']) // The target service name. There can be more than one, if sent '*' it will be sent to all relevant services in the channel. Required
        .setChannel('test') // The channel to which the services are connected, a service may have subscribed to multiple channels. Required
        .setEvent('test-event') // The event name to be sent to the target service. Required
        .setMessage('hello world') // The message to be sent to the target service. Supports object, array, string, date, etc. Required
        .setDate('+10') // How long the message will be delayed / the delivery time, +10 = 10 seconds later, new Date(), iso date string can be accepted. Optional.
);
```
#### Message Queue Consumer
```javascript
// import the server
import { Consumer } from '@connectterou/nqs/MessageQueue/Consumer.js';
// The connections constant has 2 parameters. The first one is Req/Res, the second one is the Pub/Sub server
const connections = ['tcp://127.0.0.1:5000', 'tcp://127.0.0.1:5001'];
// channel = channel is the consumer will subscribe to. This consumer only receives messages sent to this channel and to itself
// service = service name. Receives messages sent to this service name from another service
// secret = the password used to communicate with the server
let consumer = new Consumer({ connections, channel: 'test', service: 'test', secretKey: '12345' });
// The first parameter of the on method = Event name. Receives an event sent from another service. The on method can be defined multiple times
// The second parameter of the on method = callback(message, done, reject) = the callback to be executed when a message arrives
// The callback = the first parameter is the received message, the second parameter is the function to be called when the process is finished. The third parameter is called if there is any error and if the message needs to be repeated. In this way, the message is resent to the queue
consumer.on('test-event', (message, done, reject) => {
    console.log(message, 'puller 1');
    done();
    //reject();
});

consumer.connect() // Connects the consumer to the server.
```


## Service discovery

#### Service Discovery Server

```javascript
// Importing to bind the server.
import { bind } from '@connectterou/nqs/ServiceDiscovery/Server.js';
// We define the store (to keep track of services) by using "import { SQLite }" or you can also use the MySQL store by defining it as "import { MySQL }".
import { SQLite } from '@connectterou/nqs/stores.js';
// The 'port' variable is defined to specify the port number the server will listen to incoming connections on. This allows us to specify which port our server will use to accept incoming traffic and communication.
const port = 8080;
// Configuring the store.
const store = SQLite({ filename: './sr.sqlite' });
// workers = specify the number of instances the server will have.
// user = that will be used to access the service discovery server.
// password: The password that will be used to access the service discovery server.
// Note: It is best to define the number of workers as many as the number of your CPU cores.
await bind({ port, store, workers: 2, user: 'ali', password: 'veli'  });
```
##### - Service Discovery Server Endpoints
```text
GET http://user:password@host:port/services 
// List of all services along with information about each
-------------------------------------------------------------------------------------
POST http://user:password@host:port/register 
// New service registration. A JSON like the following is required.
{
    "name": "service_name", // The name to be used for accessing this service.
    "http_endpoint": "http://testservice:8080", // HTTP address of the service.
    "check_endpoint": "http://testservice:8080/health-check", // Endpoint used to ensure the service is running. Note: This endpoint should return a 200 code.
    "auth": "user:password", // If the service uses "Basic Auth", it must be entered. Otherwise, Null should be given.
    "headers": { "Authrozation": "Bearer blablabla" } // Header information to be included when a request is received from another service to this service.
}
-------------------------------------------------------------------------------------
GET | POST | DELETE | PUT http://user:password@host:port/request/[target_service_name]/[path]/[to]/[blabla] 
//  Used to make a request to a service by its name.
```

##### - Service Discovery friendly, URL transformer
```javascript
import { Transformer } from '@connectterou/nqs/ServiceDiscovery/Transformer.js';
let transformer = new Transformer('http://[service_discovery_server_host]:[port]', 'user', 'password');

transformer.transform('http://[servicename]/test/to/path?test=mest') 
// returned http://user:password@service_discovery_server_host:port/request/servicename/test/to/path?test=mest
```

### Debug
- Start for Service Discovery: NODE_DEBUG=sd:* node script.js
- Start for Message Queue: NODE_DEBUG=mq:* node script.js