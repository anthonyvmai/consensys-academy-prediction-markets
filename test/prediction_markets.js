var PredictionMarket = artifacts.require("./PredictionMarket.sol");

require('bluebird').promisifyAll(web3.eth, { suffix: "Promise" });

function toHex64(str) {
    for (var i = str.length; i < 64 + 2; i++) {
        str += "0";
    }
    return str;
}

contract("PredictionMarket", accounts => {

    var instance;

    const question0 = toHex64("0x1");
    const question1 = toHex64("0x2");

    const answer0 = toHex64("0x1");
    const answer1 = toHex64("0x2");
    const answer2 = toHex64("0x3");

    beforeEach(() => {
        return PredictionMarket.new().then(newInstance => {
            instance = newInstance;
        });
    });

    it("should allow all state changes", () => {
        return instance.openQuestion(question0, [answer0, answer1]).then(tx => {
            assert.isOk(tx, "open question failed");
            return instance.getQuestionState(question0);
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(0));
            return instance.waitQuestion(question0);
        }).then(tx => {
            assert.isOk(tx, "wait question failed");
            return instance.getQuestionState(question0);
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(1));
            return instance.answerQuestion(question0, answer0);
        }).then(tx => {
            assert.isOk(tx, "answer question failed");
            return instance.getQuestionState(question0);
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(2));
            return instance.getQuestionAnswer(question0);
        }).then(answer => {
            assert.equal(answer, answer0);
        });
    });

    it("should allow bets", () => {
        const acct0answer0bet = 100;
        const acct0answer1bet = 200;
        const acct1answer1bet = 300;

        return instance.openQuestion(question0, [answer0, answer1]).then(tx => {
            return instance.bet(question0, answer0, {from: accounts[0], value: acct0answer0bet});
        }).then(tx => {
            return instance.getQuestionAnswerBalance(question0, answer0);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0answer0bet),
                "question balance does not match amount bet");
            return instance.getQuestionUserAnswerBalance(question0, accounts[0], answer0);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0answer0bet),
                "question user balance does not match amount bet");
            return instance.bet(question0, answer1, {from: accounts[1], value: acct1answer1bet});
        }).then(tx => {
            return instance.getQuestionAnswerBalance(question0, answer1);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct1answer1bet),
                "question balance does not match amount bet");
            return instance.getQuestionUserAnswerBalance(question0, accounts[1], answer1);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct1answer1bet),
                "question user balance does not match amount bet");
            return instance.bet(question0, answer1, {from: accounts[0], value: acct0answer1bet});
        }).then(tx => {
            return instance.getQuestionAnswerBalance(question0, answer1);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0answer1bet + acct1answer1bet),
                "question balance does not match amount bet");
            return instance.getQuestionUserAnswerBalance(question0, accounts[0], answer1);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0answer1bet),
                "question user balance does not match amount bet");
        });
    });

    // acct0 bets 100 on answer 0
    // acct1 bets 200 on answer 1
    // answer1 is correct and acct1 should win 100
    it("should allow withdrawals", () => {
        const acct0answer0bet = 100;
        const acct1answer1bet = 200;
        const gasPrice = 10;

        var beforeWeiBalance;
        var weiUsed;

        return instance.openQuestion(question0, [answer0, answer1]).then(tx => {
            return instance.bet(question0, answer0, {from: accounts[0], value: acct0answer0bet});
        }).then(tx => {
            return instance.bet(question0, answer1, {from: accounts[1], value: acct1answer1bet});
        }).then(tx => {
            return instance.answerQuestion(question0, answer1);
        }).then(tx => {
            return web3.eth.getBalancePromise(accounts[1]);
        }).then(balance => {
            beforeWeiBalance = balance;
            return instance.withdraw(question0, {from: accounts[1], gasPrice: gasPrice});
        }).then(tx => {
            weiUsed = tx.receipt.gasUsed * gasPrice;
            return web3.eth.getBalancePromise(accounts[1]);
        }).then(afterWeiBalance => {
            assert.deepEqual(beforeWeiBalance.minus(weiUsed)
                .plus(web3.toBigNumber(acct0answer0bet + acct1answer1bet)),
                afterWeiBalance,
                "balance after withdrawal is incorrect");
            return web3.eth.getBalancePromise(instance.address);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(0),
                "contract balance isn't 0 after withdrawal")
        });
    });

    it("should allow multiple questions", () => {
        const bet = 100;

        return instance.openQuestion(question0, [answer0, answer1]).then(tx => {
            return instance.openQuestion(question1, [answer0, answer1]);
        }).then(tx => {
            return instance.bet(question0, answer0, {from: accounts[0], value: bet});
        }).then(tx => {
            return instance.bet(question1, answer0, {from: accounts[0], value: bet});
        }).then(tx => {
            return instance.answerQuestion(question0, answer1);
        }).then(tx => {
            return instance.answerQuestion(question1, answer1);
        });
    });

    //                table of bets
    //
    //         | acct0  | acct1  | acct2  |
    // --------+--------+--------+--------|
    // ans0    | 100    |   0    | 300    |
    // --------+--------+--------+--------|
    // ans1    | 100    | 200    |   0    |
    // --------+--------+--------+--------|
    // ans2    |   0    | 200    | 300    |
    // -----------------------------------+
    //
    // answer 2 is correct
    // acct1 wins 480 (including own bet)
    // acct2 wins 720 (including own bet)
    it("should calculate withdrawal math correctly", () => {
        const answers = [answer0, answer1, answer2];
        const bets =
            [[100, 0, 300],
             [100, 200, 0],
             [0, 200, 300]];
        const acct1won = 480;
        const acct2won = 720;

        const gasPrice = 10;

        var acct1beforeWeiBalance;
        var acct2beforeWeiBalance;
        var acct1weiUsed;
        var acct2weiUsed;

        return instance.openQuestion(question0, [answer0, answer1, answer2]).then(tx => {
            return instance.bet(question0, answers[0], {from: accounts[0], value: bets[0][0]});
        }).then(tx => {
            return instance.bet(question0, answers[0], {from: accounts[2], value: bets[0][2]});
        }).then(tx => {
            return instance.bet(question0, answers[1], {from: accounts[0], value: bets[1][0]});
        }).then(tx => {
            return instance.bet(question0, answers[1], {from: accounts[1], value: bets[1][1]});
        }).then(tx => {
            return instance.bet(question0, answers[2], {from: accounts[1], value: bets[2][1]});
        }).then(tx => {
            return instance.bet(question0, answers[2], {from: accounts[2], value: bets[2][2]});
        }).then(tx => {
            return instance.answerQuestion(question0, answers[2]);
        }).then(tx => {
            return web3.eth.getBalancePromise(accounts[1]);
        }).then(balance => {
            acct1beforeWeiBalance = balance;
            return web3.eth.getBalancePromise(accounts[2]);
        }).then(balance => {
            acct2beforeWeiBalance = balance;
            return instance.withdraw(question0, {from: accounts[1], gasPrice: gasPrice});
        }).then(tx => {
            acct1weiUsed = tx.receipt.gasUsed * gasPrice;
            return instance.withdraw(question0, {from: accounts[2], gasPrice: gasPrice});
        }).then(tx => {
            acct2weiUsed = tx.receipt.gasUsed * gasPrice;
            return web3.eth.getBalancePromise(accounts[1]);
        }).then(acct1afterWeiBalance => {
            assert.deepEqual(acct1beforeWeiBalance.minus(acct1weiUsed)
                .plus(web3.toBigNumber(acct1won)),
                acct1afterWeiBalance,
                "balance after withdrawal is incorrect");
            return web3.eth.getBalancePromise(accounts[2]);
        }).then(acct2afterWeiBalance => {
            assert.deepEqual(acct2beforeWeiBalance.minus(acct2weiUsed)
                .plus(web3.toBigNumber(acct2won)),
                acct2afterWeiBalance,
                "balance after withdrawal is incorrect");
            return web3.eth.getBalancePromise(instance.address);
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(0),
                "contract balance isn't 0 after all withdrawals")
        });
    });
});
