'use strict';

/**
 * This sample demonstrates a simple skill built with the Amazon Alexa Skills Kit.
 * The Intent Schema, Custom Slots, and Sample Utterances for this skill, as well as
 * testing instructions are located at http://amzn.to/1LzFrj6
 *
 * For additional samples, visit the Alexa Skills Kit Getting Started guide at
 * http://amzn.to/1LGWsLG
 */
var moment = require('moment');
var http = require("https");
var lastToken = null;
var lastTransactions = null;
function getToken(alexa) {
    if (!(alexa && alexa.event && alexa.event.session && alexa.event.session.user)) {
        return null;
    }
    return alexa.event.session.user.accessToken;
}
function getTransactions(location, alexa) {
    return new Promise((resolve, reject) => {
        makeRequest("/v2/locations/" + location + "/transactions", getToken(alexa)).then(value => {
            resolve(JSON.parse(value));
        });
    });
}

function getSales(alexa, date) {
    return new Promise((resolve, reject) => {
        getAllTransactions(alexa, date, 0).then(originalValues => {
            var values = originalValues.transactions;
            var amount = 0;
            for (var i = 0; i < values.length; i++) {
                for (var x = 0; x < values[i].tenders.length; x++) {
                    amount += values[i].tenders[x].amount_money.amount;
                }
            }
            resolve(amount / 100.0);
        });
    });
}

function getAllTransactionsHelper(alexa) {
    if (lastToken && lastToken === getToken(alexa)) {
        if (lastTransactions) {
            return Promise.resolve(lastTransactions);
        }
    }
    return new Promise((resolve, reject) => {
        getLocations(alexa).then(locationsOriginal => {
            var locations = locationsOriginal.locations;
            if (locations && locations.length > 0) {
                var locationPromises = [];
                for (let i = 0; i < locations.length; i++) {
                    locationPromises.push(getTransactions(locations[i].id, alexa));
                }

                var locationPromiseValues = Promise.all(locationPromises).then(values => {
                    var base = values[0];
                    for (var i = 1; i < values.length; i++) {
                        base.transactions = base.transactions.concat(values[i].transactions);
                    }
                    lastToken = getToken();
                    lastTransactions = base;
                    resolve(base);
                });

            }
            else {
                console.log(locationsOriginal);
                reject("No locations");
            }
        });
    });
}

function getAllTransactions(alexa, date, max) {
    return new Promise((resolve, reject) => {
        getAllTransactionsHelper(alexa).then(originalValues => {


            var values = originalValues.transactions;
            var filter = (val) => true;
            if (date) {
                let dateSplit = date.split("-");
                filter = (val) => {
                    let dateObject = new Date(val.created_at);
                    const year = dateObject.getFullYear();
                    const month = dateObject.getMonth();
                    const day = dateObject.getDay();
                    if (year.toString() !== dateSplit[0]) {
                        return false;
                    }
                    if (dateSplit.length === 1) return true;
                    if (month !== Number.parseInt(dateSplit[1])) {
                        return false;
                    }
                    if (dateSplit.length === 2) return true;
                    return day === Number.parseInt(dateSplit[2]);
                }
            }
            var transactions = [];
            for (var i = 0; i < values.length; i++) {
                if (filter(values[i])) {
                    transactions.push(values[i]);
                }
            }
            transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            if (max === 0 || max >= transactions.length)
                resolve({ transactions: transactions });
            else {
                resolve({ transactions: transactions.slice(0, max) });
            }

        });
    });
}

function getLocations(alexa) {
    return new Promise((resolve, reject) => {
        makeRequest("/v2/locations", getToken(alexa)).then(value => {
            resolve(JSON.parse(value));
        });
    });
}

function makeRequest(url, token) {

    var options = {
        "method": "GET",
        "hostname": "connect.squareup.com",
        "port": null,
        "path": url,
        "headers": {
            "authorization": "Bearer " + token
        }
    };
    return new Promise((resolve, reject) => {


        var req = http.request(options, function (res) {
            var chunks = [];

            res.on("data", function (chunk) {
                chunks.push(chunk);
            });

            res.on("end", function () {
                var body = Buffer.concat(chunks);
                resolve(body);
            });
        });

        req.end();
    });
}
// --------------- Helpers that build all of the responses -----------------------


const Alexa = require('alexa-sdk');

const APP_ID = undefined;  // TODO replace with your app ID (OPTIONAL).

const languageStrings = {
    'en': {
        translation: {
            SKILL_NAME: 'Square',
            GET_SALES_MESSAGE: "Total Sales for ",
            GET_TRANSACTIONS_MESSAGE: "Here are your latest transactions: ",
            GET_ONE_TRANSACTIONS_MESSAGE: "Here is your latest transaction: ",
            GET_NO_TRANSACTIONS_MESSAGE: "You have no transactions",
            HELP_MESSAGE: 'You can say list transactions, or you can say what are my sales for this year, or, you can say exit... What can I help you with?',
            HELP_REPROMPT: 'What can I help you with?',
            STOP_MESSAGE: 'Goodbye!',
            ERROR: "An error has occured"
        },
    },


};

const handlers = {
    'LaunchRequest': function () {
        this.emit('GetFact');
    },
    'TRANSACTIONSList': function () {
        this.emit('GetTransactions');
    },
    'SALESAmount': function () {
        this.emit('GetSales');
    },
    'GetSales': function () {
        try {
            var intentObj = this.event.request.intent;
            if (!intentObj.slots.Date) {
                intentObj.slots.Date = { value: null };
            }
            if (!getToken(this)) {
                this.emit(':tellWithLinkAccountCard', "Please link your Square account");
                return;
            }
            if (intentObj.slots.Date.value && !intentObj.slots.Date.value.match(/^[0-9\-]*$/)) {
                this.emit(":tell", "This form of date is not supported");
                return;
            }
            getSales(this, intentObj.slots.Date.value).then((value) => {
                try {
                    let valueObject = value;
                    var message = "";
                    console.log(valueObject);
                    message = (intentObj.slots.Date.value || "All Time:") + " $" + valueObject;
                    var speechMessage;
                    if (intentObj.slots.Date.value) {
                        var dateValue = intentObj.slots.Date.value;
                        if (dateValue.indexOf("-") === -1) {
                            dateValue = dateValue + "-??-??";
                        }
                        else if (dateValue.indexOf("-", 5) === -1) {
                            dateValue = dateValue + "-??";
                        }
                        dateValue = dateValue.split("-").join("")
                        speechMessage = (`<say-as interpret-as="date">${dateValue}</say-as>.` || "All Time:") + " $" + valueObject;
                    }
                    else {
                        speechMessage = message;
                    }
                    console.log(message);
                    this.emit(":tellWithCard", this.t("GET_SALES_MESSAGE") + "\n" + speechMessage, this.t("SKILL_NAME"), message);
                }
                catch (e) {
                    console.error(e);
                    this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));

                }
            }, (error) => {
                console.error(error);
                this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));
            });
        }
        catch (e) {
            console.error(e);
            this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));
        }
    },
    'GetTransactions': function () {
        try {
            var intentObj = this.event.request.intent;
            if (!intentObj.slots.Date) {
                intentObj.slots.Date = { value: null };
            }
            if (!getToken(this)) {
                this.emit(':tellWithLinkAccountCard', "Please link your Square account");
                return;
            }
            if (intentObj.slots.Date.value && !intentObj.slots.Date.value.match(/^[0-9\-]*$/)) {
                this.emit(":tell", "This form of date is not supported");
                return;
            }
            if (!getToken(this)) {
                this.emit(':tellWithLinkAccountCard', "Please link your Square account");
                return;
            }
            var max = 0;
            if (intentObj.slots.Max && intentObj.slots.Max.value) {
                max = intentObj.slots.Max.value;
            }
            // Get a random space fact from the space facts list
            // Use this.t() to get corresponding language data
            getAllTransactions(this, intentObj.slots.Date.value, max).then((value) => {
                try {
                    let valueObject = value;
                    var message = "";
                    var speechMessage = "";
                    console.log(valueObject);
                    console.log(valueObject.transactions);
                    for (var i = 0; i < valueObject.transactions.length; i++) {
                        var currentAmount = valueObject.transactions[i].tenders.reduce((p, c) => { amount_money: { amount: { p.amount_money.amount + c.amount_money.amount } } }).amount_money.amount / 100.0;
                        var formattedDate = moment(valueObject.transactions[i].created_at).format("dddd, MMMM Do YYYY, h:mm a");
                        message += `There was a transaction on ${formattedDate} for $${currentAmount}\n`;
                        speechMessage += `There was a transaction on ${formattedDate} for $${currentAmount}\n`;
                    }
                    console.log(message);
                    if (valueObject.transactions.length > 1) {
                        this.emit(":tellWithCard", this.t("GET_TRANSACTIONS_MESSAGE") + "\n" + speechMessage, this.t("SKILL_NAME"), message);
                    }
                    else if (valueObject.transactions.length === 1) {
                        this.emit(":tellWithCard", this.t("GET_ONE_TRANSACTIONS_MESSAGE") + "\n" + speechMessage, this.t("SKILL_NAME"), message);
                        
                    }
                    else {
                        this.emit(":tellWithCard", this.t("GET_NO_TRANSACTIONS_MESSAGE"), this.t("SKILL_NAME"), this.t("GET_NO_TRANSACTIONS_MESSAGE"));
                        
                    }
                }
                catch (e) {
                    console.error(e);
                    this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));

                }
            }, (error) => {
                console.error(error);
                this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));
            });
        }
        catch (e) {
            console.error(e);
            this.emit(":tellWithCard", this.t("ERROR"), this.t('SKILL_NAME'), this.t("ERROR"));

        }
        // Create speech output
    },
    'GetFact': function () {
        // Get a random space fact from the space facts list
        // Use this.t() to get corresponding language data
        const factArr = this.t('FACTS');
        const factIndex = Math.floor(Math.random() * factArr.length);
        const randomFact = factArr[factIndex];

        // Create speech output
        const speechOutput = this.t('GET_FACT_MESSAGE') + randomFact;
        this.emit(':tellWithCard', speechOutput, this.t('SKILL_NAME'), randomFact);
    },
    'AMAZON.HelpIntent': function () {
        const speechOutput = this.t('HELP_MESSAGE');
        const reprompt = this.t('HELP_MESSAGE');
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.CancelIntent': function () {
        this.emit(':tell', this.t('STOP_MESSAGE'));
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', this.t('STOP_MESSAGE'));
    },
};

exports.handler = function (event, context) {
    const alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};
