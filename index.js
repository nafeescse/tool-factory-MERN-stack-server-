
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
// const ObjectId = require('mongodb').ObjectId;
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_pass}@cluster0.6hlib.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'UnAuthorized Access'})
    }
    const token = authHeader.split(' ')[1];
     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
         if(err) {
             return res.status(403).send({message: 'Forbidden Access'});
         }
        req.decoded = decoded;
        next();
     })

}


async function run() {
    try {
        await client.connect();
        const toolsCollection = client.db('autocar-tools').collection('products');
        const orderCollection = client.db('autocar-tools').collection('orders');
        const userCollection = client.db('autocar-tools').collection('users');
        const profileCollection = client.db('autocar-tools').collection('profiles');
        const reviewsCollection = client.db('autocar-tools').collection('reviews');
        const paymentsCollection = client.db('autocar-tools').collection('payments');


        //For Stripe
        app.post('/create-payment-intent',  async(req, res) =>{
            const order = req.body;
            const price = order.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
              amount : amount,
              currency: 'usd',
              payment_method_types: ['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
          });


        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);

        })

        //Add a product
        app.post('/tools', async (req, res) => {
            const item = req.body;
            console.log('adding new item', item);
            const result = await toolsCollection.insertOne(item);
            res.send(result)
        });

        app.get('/tools/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolsCollection.findOne(query);
            res.send(result);
        });

  

        app.delete('/tools/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolsCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/users', verifyJWT, async(req, res) => {
            const users= await userCollection.find().toArray();
            res.send(users);
        })
        // delete user
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })
        // add user data
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email};
            const options = {upsert: true};
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
            res.send({result, token});
        });

        app.post('/profile', async (req, res) => {
            const profile = req.body;
            console.log('adding new item', profile);
            const result = await profileCollection.insertOne(profile);
            res.send(result)
        });


        app.get('/profile',  async(req, res) => {
            const users= await profileCollection.find().toArray();
            res.send(users);
        })

        app.get('/profile/:email', async (req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const result = await profileCollection.findOne(filter);
            res.send(result);
        });

        app.get('/admin/:email', async(req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin});
        })

        // add admin
        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const updatedDoc = {
                $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send({result});
        });

        // POST ner order

        app.post('/orders', async (req, res) => {
            const order = req.body;
            console.log('adding new item', order);
            const result = await orderCollection.insertOne(order);
            res.send(result)
        });


        //get all orders
        app.get('/orders', async(req, res) => {
            const allOrders = await orderCollection.find().toArray();
            res.send(allOrders);
        })
        // get specific users orders
        app.get('/order', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if(email === decodedEmail){
                const query = {email: email};
                const cursor = orderCollection.find(query);
                const orders = await cursor.toArray();
                return res.send(orders);
            }
            else{
                return res.status(403).send({message: 'Forbidden Access'})
            }
        })

              
        app.get('/orders/:email', async(req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await orderCollection.findOne(query);
            res.send(user);
        })

        app.get('/orders/:id', verifyJWT, async(req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const order = await orderCollection.findOne(query);
            res.send(order);
          })

        app.patch('/orders/:id',  async(req, res) =>{
            const id  = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc = {
              $set: {
                paid: true,
                transactionId: payment.transactionId
              }
            }
      
            const result = await paymentsCollection.insertOne(payment);
            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
          })
      


        // delete an item by admin
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })

        // delete an item by user
        app.delete('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })
        
        app.post('/reviews', async (req, res) => {
            const reviews = req.body;
            console.log('adding new item', reviews);
            const result = await reviewsCollection.insertOne(reviews);
            res.send(result)
        });
        app.get('/reviews', async(req, res) => {
            const allOrders = await reviewsCollection.find().toArray();
            res.send(allOrders);
        })

        app.get('/reviews/:email', async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const cursor = reviewsCollection.find(query);
            const review = await cursor.toArray();
            res.send(review);
        })


        console.log('connected db');

    }
    finally {

    }

}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`listening on port ${port}`)
})

