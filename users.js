'use strict';
//test
var __rest =
	(this && this.__rest) ||
	function (s, e) {
		var t = {};
		for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
		if (s != null && typeof Object.getOwnPropertySymbols === 'function')
			for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
				if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
			}
		return t;
	};
Object.defineProperty(exports, '__esModule', { value: true });
const bcrypt = require('bcryptjs');
const express_1 = require('express');
const jwt = require('jsonwebtoken');
const shared_middlewares_1 = require('./shared-middlewares');
const constants_1 = require('./constants');
/**
 * Validate email and password
 */
const validate = ({ required }) => (req, res, next) => {
	const { email, password } = req.body;
	if (required && (!email || !email.trim() || !password || !password.trim())) {
		res.status(400).jsonp('Email and password are required');
		return;
	}
	if (email && !email.match(constants_1.EMAIL_REGEX)) {
		res.status(400).jsonp('Email format is invalid');
		return;
	}
	if (password && password.length < constants_1.MIN_PASSWORD_LENGTH) {
		res.status(400).jsonp('Password is too short');
		return;
	}
	next();
};
/**
 * Register / Create a user
 */
const create = (req, res, next) => {
	const _a = req.body,
		{ email, password, authFields } = _a,
		rest = __rest(_a, ['email', 'password', 'authFields']);
	const { db } = req.app;
	const fields = {};
	if (authFields) authFields.forEach((field) => (fields[field] = req.body[field]));
	if (db == null) {
		// json-server CLI expose the router db to the app
		// (https://github.com/typicode/json-server/blob/master/src/cli/run.js#L74),
		// but if we use the json-server module API, we must do the same.
		throw Error('You must bind the router db to the app');
	}
	const existingUser = db.get('users').find({ email }).value();
	if (existingUser) {
		res.status(400).jsonp('Email already exists');
		return;
	}
	bcrypt
		.hash(password, constants_1.SALT_LENGTH)
		.then((hash) => {
			// Create users collection if doesn't exist,
			// save password as hash and add any other field without validation
			try {
				return db
					.get('users')
					.insert(Object.assign({ email, password: hash, authFields }, rest))
					.write();
			} catch (error) {
				throw Error('You must add a "users" collection to your db');
			}
		})
		.then((user) => {
			return new Promise((resolve, reject) => {
				jwt.sign(
					Object.assign({ email }, fields),
					constants_1.JWT_SECRET_KEY,
					{ expiresIn: constants_1.JWT_EXPIRES_IN, subject: String(user.id) },
					(error, idToken) => {
						if (error) reject(error);
						else resolve(idToken);
					}
				);
			});
		})
		.then((accessToken) => {
			// Return an access token instead of the user record
			res.status(201).jsonp({ accessToken });
		})
		.catch(next);
};
/**
 * Login
 */
const login = (req, res, next) => {
	const { email, password } = req.body;
	const { db } = req.app;
	if (db == null) {
		throw Error('You must bind the router db to the app');
	}
	const user = db.get('users').find({ email }).value();
	if (!user) {
		res.status(400).jsonp('Cannot find user');
		return;
	}
	const fields = {};
	if (user.authFields) user.authFields.forEach((field) => (fields[field] = user[field]));
	bcrypt
		.compare(password, user.password)
		.then((same) => {
			if (!same) throw 400;
			return new Promise((resolve, reject) => {
				jwt.sign(
					Object.assign({ email }, fields),
					constants_1.JWT_SECRET_KEY,
					{ expiresIn: constants_1.JWT_EXPIRES_IN, subject: String(user.id) },
					(error, idToken) => {
						if (error) reject(error);
						else resolve(idToken);
					}
				);
			});
		})
		.then((accessToken) => {
			res.status(200).jsonp({ accessToken });
		})
		.catch((err) => {
			if (err === 400) res.status(400).jsonp('Incorrect password');
			else next(err);
		});
};
/**
 * Patch and Put user
 */
// TODO: create new access token when password or email changes
const update = (req, res, next) => {
	const { password } = req.body;
	if (!password) {
		next(); // Simply continue with json-server router
		return;
	}
	bcrypt
		.hash(password, constants_1.SALT_LENGTH)
		.then((hash) => {
			req.body.password = hash;
			next();
		})
		.catch(next);
};
/**
 * Users router
 */
exports.default = express_1
	.Router()
	.use(shared_middlewares_1.bodyParsingHandler)
	.post('/users|register|signup', validate({ required: true }), create)
	// Bypass eventual users guards to still allow creation
	.post('/[640]{3}/users', validate({ required: true }), create)
	.post('/login|signin', validate({ required: true }), login)
	.put('/users/:id', validate({ required: true }), update)
	.patch('/users/:id', validate({ required: false }), update)
	.use(shared_middlewares_1.errorHandler);
