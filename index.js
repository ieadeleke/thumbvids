const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const path = require('path');
const { users, templates, Designs, youtube_accounts } = require('./database/connection');
const base64Img = require('base64-img');
const env = require('dotenv');
const { userSignUp, userSignIn } = require('./database/userValidation');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const cookie = require('cookie-parser');
const readJson = require('r-json');
const gal = require('google-auth-library');
const youtubeParser = require("youtube-api");
const cors = require('cors');
const middleware = require('./database/middleware');
const mildMiddleware = require('./database/mild-middleware');
const fs = require('fs');

env.config();


const app = express();



var clientid = '';
var client_secret = '';
var redirect_url = '';

readJson(path.join(__dirname, 'client_secret.json'), (err, data) => {
    if (err) throw err;
    clientid = data.web.client_id;
    client_secret = data.web.client_secret;
    redirect_url = data.web.redirect_uris;

})

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];


app.set('view engine', ejs);

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));

app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookie('aaaaa'));
app.use(cors({
    origin: '*'
}));
app.use(session({
    secret: 'aaaa',
    saveUninitialized: false,
    resave: true
}))

app.get('/', (req, res) => {
    if (req.session.token) {
        let checkToken = jwt.verify(req.session.token, 'abcdefghijklmnopqrstuvwxyz');
        if (checkToken.user._id) {
            let { user } = checkToken;
            res.render('index.ejs', { user })
        } else {
            res.render('index.ejs')
        }
    } else {
        res.render('index.ejs');
    }
})
app.get('/templates', mildMiddleware, (req, res) => {
    templates.find({})
        .then(data => {
            if (res.body) {
                res.render('templates.ejs', { user: res.body, data })
            } else {
                res.render('templates.ejs', { data })
            }
        })
        .catch(err => res.send(err))
})
app.get('/signin', mildMiddleware, (req, res) => {
    if (res.body) {
        res.render('signin.ejs', { user: res.body })
    } else {
        res.render('signin.ejs')
    }
})
app.get('/signup', mildMiddleware, (req, res) => {
    if (res.body) {
        res.render('signup.ejs', { user: res.body })
    } else {
        res.render('signup.ejs')
    }
})
app.post('/signup', async (req, res) => {
    let { firstName, lastName, password, email } = req.body;
    let { error } = await (userSignUp(req.body));

    if (error) {
        res.render('signup.ejs', { error: error.details[0].message, firstName, lastName, password, email })
    } else {

        users.findOne({ email: req.body.email })
            .then(data => {
                if (data) {
                    res.render('signup.ejs', {
                        error: 'Email exists in database already, try signing in instead', firstName,
                        lastName, password, email
                    })
                } else {
                    bcrypt.genSalt(10, (err, salt) => {
                        if (err) throw err;
                        bcrypt.hash(password, salt, (err, hash) => {
                            if (err) throw err;
                            let newUser = new users;
                            newUser.firstName = firstName;
                            newUser.lastName = lastName;
                            newUser.email = email;
                            newUser.password = hash;

                            newUser.save()
                                .then(() => {
                                    res.redirect('/signin')
                                })
                                .catch(err => {
                                    res.send('An error occurred. Please try again later')
                                })
                        })
                    })
                }
            })
            .catch(err => {
                res.send('An error occurred. Please try again later');
            })

    }

})

app.post('/signin', async (req, res) => {
    let { password, email } = req.body;
    let { error } = await (userSignIn(req.body));

    if (error) {
        res.render('signin.ejs', { error: error.details[0].message, email })
    } else {
        try {
            let user = await users.findOne({ email });
            if (user) {
                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if (err) throw err;
                    if (isMatch) {
                        let jwtToken = jwt.sign({ user }, 'abcdefghijklmnopqrstuvwxyz');
                        req.session.token = jwtToken;
                        res.redirect('/');
                    } else {
                        res.render('signin.ejs', { error: 'No user found', email });
                    }
                })
            } else {
                res.render('signin.ejs', { error: 'No user found', email });
            }
        } catch (err) {
            res.send(err);
        }
    }
})
app.get('/createTemplates', middleware, (req, res) => {
    res.render('test.ejs');
})

app.get('/edit/:id', mildMiddleware, (req, res) => {
    if (res.body) {
        templates.findById(req.params.id)
            .then(data => res.render('testedit.ejs', { canvas: data.svgCode, user: res.body }))
            .catch(err => res.send(err))
    } else {
        templates.findById(req.params.id)
            .then(data => res.render('testedit.ejs', { canvas: data.svgCode }))
            .catch(err => res.send(err))
    }
})
app.get('/scratch', mildMiddleware, (req, res) => {
    if (res.body) {
        res.render('scratch.ejs', { user: res.body })
    } else {
        res.render('scratch.ejs')
    }
})
app.get('/templates/:tagName', mildMiddleware, async (req, res) => {
    let searchParam = req.params.tagName;
    try {
        let allList = await templates.find({});
        let filteredList = allList.filter(ratio => {
            return ratio.tags.includes(searchParam);
        })
        if (res.body) {
            res.render('search.ejs', { filteredList, searchParam, user: res.body });
        } else {
            res.render('search.ejs', { filteredList, searchParam })
        }
    } catch (err) {
        res.send(err)
    }
})

app.post('/saveTemplates', (req, res) => {

    const url = './public/templates/thumbnails/' + Date.now();
    base64Img.img(req.body.message, '', url, function (err, filepath) { });

    try {
        let template = new templates();
        template.name = req.body.templateName;
        template.svgCode = req.body.svgFile;
        template.description = req.body.description;
        template.location = url + '.png';
        template.tags = req.body.tags;
        template.save();

        res.send('Template Saved');
    } catch (err) {
        res.send(err);
    }

})


app.get('/connectYoutube', middleware, (req, res) => {
    youtube_accounts.findOne({
        where: { user_id: res.body.id }
    })
        .then(data => {
            if (!data) {
                res.render('youtube.ejs')
            } else {
                res.render('youtube.ejs', { data })
            }
        })
        .catch(err => {
            res.send('An error occurred. Please try again');
        })
})
app.get('/google', middleware, (req, res) => {

    const oauth2Client = new google.auth.OAuth2(
        clientid,
        client_secret,
        redirect_url[0]
    );

    const url = oauth2Client.generateAuthUrl({
        // 'online' (default) or 'offline' (gets refresh_token)
        access_type: 'offline',
        prompt: 'consent',

        // If you only need one scope you can pass it as a string
        scope: SCOPES
    });
    res.redirect(url)
})
app.get('/getResponse', middleware, async (req, res) => {
    if (!req.query.error) {
        const oauth2Client = new google.auth.OAuth2(
            clientid,
            client_secret,
            redirect_url[0]
        );

        const { tokens } = await oauth2Client.getToken(req.query.code)
        await oauth2Client.setCredentials(tokens);

        var oauth2 = google.oauth2({
            auth: oauth2Client,
            version: 'v2'
        });

        oauth2.userinfo.get(async (err, data) => {
            if (err) {
                console.log(err);
            } else {

                console.log(data.data.email)

                await youtube_accounts.findOne({
                    where: { email: data.data.email }
                })
                    .then(async user_data => {
                        if (!user_data) {
                            console.log('don')
                            await youtube_accounts.create({
                                name: data.data.name,
                                picture: data.data.picture,
                                email: data.data.email,
                                picture: data.data.picture,
                                refresh_token: tokens.refresh_token,
                                user_id: res.body.id
                            }).then(() => {
                                console.log('done')
                                res.cookie('access_token', tokens.access_token, { maxAge: 3600, httpOnly: true });
                                res.redirect('/');
                            })
                                .catch(err => {
                                    console.log('err')
                                    res.send('An error occurred. Please try again')
                                });
                        } else {
                            console.log('do')
                            res.redirect('/');
                        }
                    })
                    .catch(err => {
                        console.log(err)
                        res.send('An error occurred. Please try again')
                    })
            }
        });

    } else {
        // req.flash('error', 'We could not add link your youtube account to our website. Please retry and accept google permissions.');
        res.send('An error occurred. Please try again');
    }
})

app.post('/saveDesign', middleware, async (req, res) => {
    const currentTime = Date.now();
    const url = './public/designs/thumbnails/' + currentTime;
    base64Img.img(req.body.message, '', url, function (err, filepath) { });

    let newDesign = new Designs();
    newDesign.location = url + '.png';
    newDesign.svgCode = JSON.stringify(req.body.svgFile);
    newDesign.user_id = res.body.id;
    newDesign.save()
        .then(done => {
            res.json('Design saved successfully')
        })
        .catch(err => {
            res.json(err)
        })
})
app.get('/videos', middleware, (req, res) => {
    function getVideos(pid, access) {
        fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails&maxResults=50&playlistId=${pid}`, {
            method: "GET",
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${access}`
            }
        })
            .then(response => response.json())
            .then(newdata => {
                res.send(newdata)
            })
            .catch(err => console.log(err))
    }
    const youtube = google.youtube({
        version: 'v3',
        auth: process.api_key
    });
    async function refreshToken(token) {
        const oauth2Client = new google.auth.OAuth2(
            clientid,
            client_secret,
            redirect_url[0]
        );
        oauth2Client.setCredentials({ refresh_token: token });

        const accessToken = await oauth2Client.getAccessToken();
        const newToken = accessToken.res.data.access_token;
        res.cookie('access_token', newToken, { maxAge: 36000, httpOnly: true })

        let newOauth2Client = new gal.OAuth2Client(newToken, clientid, client_secret, redirect_url[0]);
        newOauth2Client.credentials = { access_token: newToken }
        return newOauth2Client;
    }
    youtube_accounts.findOne({ user_id: res.body.id })
        .then(async data => {
            if (!data) {
                res.json({ error: 'No linked Youtube account found' });
            } else {
                if (req.cookies['access_token']) {
                    fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + req.cookies['access_token'])
                        .then(response => response.json())
                        .then(async data => {
                            if (data.error) {
                                let myres = await refreshToken(data.refresh_token);

                                let newOauth2Client = new gal.OAuth2Client(clientid, client_secret, redirect_url[0]);
                                newOauth2Client.credentials = { access_token: myres.credentials.access_token }

                                youtube.channels.list({
                                    auth: newOauth2Client, part: 'contentDetails',
                                    mine: true, maxResults: 100,
                                }, (err, response) => {
                                    if (err) throw err;
                                    let responseResults = response.data.items;
                                    responseResults.forEach(newData => {
                                        getVideos(newData.contentDetails.relatedPlaylists.uploads, myres.credentials.access_token)
                                    })
                                });
                            } else {
                                let newOauth2Client = new gal.OAuth2Client(clientid, client_secret, redirect_url[0]);
                                newOauth2Client.credentials = { access_token: req.cookies['access_token'] }

                                youtube.channels.list({
                                    auth: newOauth2Client, part: 'contentDetails',
                                    mine: true, maxResults: 100,
                                }, (err, response) => {
                                    if (!err) {
                                        let responseResults = response.data.items;
                                        responseResults.forEach(newData => {
                                            getVideos(newData.contentDetails.relatedPlaylists.uploads, req.cookies['access_token'])
                                        })
                                    } else {
                                        console.log(err)
                                    }
                                })
                                //
                            }
                        })
                        .catch(err => res.send(err));
                } else {
                    let myres = await refreshToken(data.refresh_token);

                    let newOauth2Client = new gal.OAuth2Client(clientid, client_secret, redirect_url[0]);
                    newOauth2Client.credentials = { access_token: myres.credentials.access_token }

                    youtube.channels.list({
                        auth: newOauth2Client, part: 'contentDetails',
                        mine: true, maxResults: 100,
                    }, (err, response) => {
                        if (err) throw err;
                        let responseResults = response.data.items;
                        responseResults.forEach(newData => {
                            getVideos(newData.contentDetails.relatedPlaylists.uploads, myres.credentials.access_token)
                        })
                    });
                }
            }
        })
        .catch(err => {
            res.send('An error occured. Please try again');
        })
})

app.post('/uploadThumbnail', middleware, async (req, res) => {
    const currentTime = Date.now()
    const url = './public/designs/thumbnails/' + currentTime;
    base64Img.img(req.body.message, '', url, function (err, filepath) { });

    let oauth = youtubeParser.authenticate({
        type: "oauth",
        clientid,
        client_secret,
        redirect_url: redirect_url[0]
    });
    async function refreshToken(token) {
        const oauth2Client = new google.auth.OAuth2(
            clientid,
            client_secret,
            redirect_url[0]
        );
        oauth2Client.setCredentials({ refresh_token: token });

        const accessToken = await oauth2Client.getAccessToken();
        const newToken = accessToken.res.data.access_token;
        res.cookie('access_token', newToken, { maxAge: 36000, httpOnly: true })

        let newOauth2Client = new gal.OAuth2Client(newToken, clientid, client_secret, redirect_url[0]);
        newOauth2Client.credentials = { access_token: newToken }
        return newOauth2Client;
    }
    await youtube_accounts.findOne({ user_id: res.body.id })
        .then(async data => {
            if (!data) {
                console.log('err')
                res.json('No linked Youtube account found');
            } else {
                if (req.cookies['access_token']) {
                    fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + req.cookies['access_token'])
                        .then(response => response.json())
                        .then(async data => {
                            if (data.error) {
                                console.log('air')
                                let oauth = youtubeParser.authenticate({
                                    type: "oauth",
                                    clientid,
                                    client_secret,
                                    redirect_url: redirect_url[0]
                                });
                                let myres = await refreshToken(data.refresh_token);
                                oauth.credentials = { access_token: myres.credentials.access_token };
                                youtubeParser.thumbnails.set({
                                    videoId: req.body.videoId,
                                    media: {
                                        mimeType: "image/png",
                                        body: fs.readFileSync(url + '.png')
                                    }
                                }, async (err, thumbResponse) => {
                                    if (err) throw err
                                    let newDesign = new Designs();
                                    newDesign.location = url + '.png';
                                    newDesign.svgCode = JSON.stringify(req.body.svgFile);
                                    newDesign.user_id = res.body.id;
                                    newDesign.save()
                                        .then(data => {
                                            console.log(thumbResponse)
                                            res.send(thumbResponse)
                                        })
                                        .catch(err => {
                                            console.log(err)
                                        })
                                })
                            } else {
                                let oauth = youtubeParser.authenticate({
                                    type: "oauth",
                                    clientid,
                                    client_secret,
                                    redirect_url: redirect_url[0]
                                });
                                oauth.credentials = { access_token: req.cookies['access_token'] }
                                youtubeParser.thumbnails.set({
                                    videoId: req.body.videoId,
                                    media: {
                                        mimeType: "image/png",
                                        body: fs.readFileSync(url + '.png')
                                    }
                                }, async (err, thumbResponse) => {
                                    if (err) throw err;

                                    let newDesign = new Designs();
                                    newDesign.location = url + '.png';
                                    newDesign.svgCode = JSON.stringify(req.body.svgFile);
                                    newDesign.user_id = res.body.id;
                                    newDesign.save()
                                        .then(data => {
                                            console.log(thumbResponse)
                                            res.send(thumbResponse)
                                        })
                                        .catch(err => {
                                            console.log(err)
                                        })
                                })
                            }
                        })
                        .catch(err => {
                            console.log(err)
                            res.send(err)
                        });
                } else {
                    console.log('yea')
                    let oauth = youtubeParser.authenticate({
                        type: "oauth",
                        clientid,
                        client_secret,
                        redirect_url: redirect_url[0]
                    });
                    let myres = await refreshToken(data.refresh_token);
                    oauth.credentials = { access_token: myres.credentials.access_token };
                    youtubeParser.thumbnails.set({
                        videoId: req.body.videoId,
                        media: {
                            mimeType: "image/png",
                            body: fs.readFileSync(url + '.png')
                        }
                    }, async (err, thumbResponse) => {
                        if (err) throw err
                        let newDesign = new Designs();
                        newDesign.location = url + '.png';
                        newDesign.svgCode = JSON.stringify(req.body.svgFile);
                        newDesign.user_id = res.body.id;
                        newDesign.save()
                            .then(data => {
                                console.log(thumbResponse)
                                res.send(thumbResponse)
                            })
                            .catch(err => {
                                console.log(err)
                            })
                    })
                }
            }
        })
        .catch(err => {
            console.log(err)
            res.send('An error ocurred. Please try again');
        })
})




const port = process.env.PORT || 8080;
app.listen(port, () => console.log('server listening on port', port));