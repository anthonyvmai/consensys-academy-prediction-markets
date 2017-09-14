let Question = artifacts.require("./Question.sol")

require('bluebird').promisifyAll(web3.eth, { suffix: "Promise" })

function toHex64(str) {
    for (let i = str.length; i < 64 + 2; i++) {
        str += "0"
    }
    return str
}

contract("Question", accounts => {

    let instance

    const question = toHex64("0x1")
    const answers = [toHex64("0x1"), toHex64("0x2"), toHex64("0x3")]

    beforeEach(() => {
        return Question.new(question, accounts[0], answers).then(newInstance => {
            instance = newInstance
        })
    })

    it("should allow all state changes", () => {
        return instance.state().then(state => {
            assert.deepEqual(state, web3.toBigNumber(0))
            return instance.waitQuestion()
        }).then(tx => {
            assert.isOk(tx, "wait question failed")
            return instance.state()
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(1))
            return instance.answerQuestion(answers[0])
        }).then(tx => {
            assert.isOk(tx, "answer question failed")
            return instance.state()
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(2))
            return instance.theAnswer()
        }).then(answer => {
            assert.equal(answer, answers[0])
        })
    })

    it("should allow bets", () => {
        const acct0Answers0Bet = 100
        const acct0Answers1Bet = 200
        const acct1Answers1Bet = 300

        return instance.bet(answers[0], {from: accounts[0], value: acct0Answers0Bet}).then(tx => {
            return instance.answerBalances(answers[0])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0Answers0Bet),
                "question balance does not match amount bet")
            return instance.getUserAnswerBalance(accounts[0], answers[0])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0Answers0Bet),
                "question user balance does not match amount bet")
            return instance.bet(answers[1], {from: accounts[1], value: acct1Answers1Bet})
        }).then(tx => {
            return instance.answerBalances(answers[1])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct1Answers1Bet),
                "question balance does not match amount bet")
            return instance.getUserAnswerBalance(accounts[1], answers[1])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct1Answers1Bet),
                "question user balance does not match amount bet")
            return instance.bet(answers[1], {from: accounts[0], value: acct0Answers1Bet})
        }).then(tx => {
            return instance.answerBalances(answers[1])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0Answers1Bet + acct1Answers1Bet),
                "question balance does not match amount bet")
            return instance.getUserAnswerBalance(accounts[0], answers[1])
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(acct0Answers1Bet),
                "question user balance does not match amount bet")
        })
    }) 

    // acct0 bets 100 on answer 0
    // acct1 bets 200 on answer 1
    // answers[1] is correct and acct1 should win 100
    it("should allow withdrawals", () => {
        const acct0Answers0Bet = 100
        const acct1Answers1Bet = 200
        const gasPrice = 10

        let beforeWeiBalance
        let weiUsed

        return instance.bet(answers[0], {from: accounts[0], value: acct0Answers0Bet}).then(tx => {
            return instance.bet(answers[1], {from: accounts[1], value: acct1Answers1Bet})
        }).then(tx => {
            return instance.answerQuestion(answers[1])
        }).then(tx => {
            return web3.eth.getBalancePromise(accounts[1])
        }).then(balance => {
            beforeWeiBalance = balance
            return instance.withdraw({from: accounts[1], gasPrice: gasPrice})
        }).then(tx => {
            weiUsed = tx.receipt.gasUsed * gasPrice
            return web3.eth.getBalancePromise(accounts[1])
        }).then(afterWeiBalance => {
            assert.deepEqual(beforeWeiBalance.minus(weiUsed)
                .plus(web3.toBigNumber(acct0Answers0Bet + acct1Answers1Bet)),
                afterWeiBalance,
                "balance after withdrawal is incorrect")
            return web3.eth.getBalancePromise(instance.address)
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(0),
                "contract balance isn't 0 after withdrawal")
        })
    })

////    it("should allow multiple questions", () => {
////        const bet = 100
////
////        return instance.openQuestion(question, [answers[0], answers[1]]).then(tx => {
////            return instance.openQuestion(question1, [answers[0], answers[1]])
////        }).then(tx => {
////            return instance.bet(question, answers[0], {from: accounts[0], value: bet})
////        }).then(tx => {
////            return instance.bet(question1, answers[0], {from: accounts[0], value: bet})
////        }).then(tx => {
////            return instance.answerQuestion(question, answers[1])
////        }).then(tx => {
////            return instance.answerQuestion(question1, answers[1])
////        })
////    })

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
        const bets =
            [[100, 0, 300],
             [100, 200, 0],
             [0, 200, 300]]
        const acct1won = 480
        const acct2won = 720

        const gasPrice = 10

        let acct1beforeWeiBalance
        let acct2beforeWeiBalance
        let acct1weiUsed
        let acct2weiUsed

        return instance.bet(answers[0], {from: accounts[0], value: bets[0][0]}).then(tx => {
            return instance.bet(answers[0], {from: accounts[2], value: bets[0][2]})
        }).then(tx => {
            return instance.bet(answers[1], {from: accounts[0], value: bets[1][0]})
        }).then(tx => {
            return instance.bet(answers[1], {from: accounts[1], value: bets[1][1]})
        }).then(tx => {
            return instance.bet(answers[2], {from: accounts[1], value: bets[2][1]})
        }).then(tx => {
            return instance.bet(answers[2], {from: accounts[2], value: bets[2][2]})
        }).then(tx => {
            return instance.answerQuestion(answers[2])
        }).then(tx => {
            return web3.eth.getBalancePromise(accounts[1])
        }).then(balance => {
            acct1beforeWeiBalance = balance
            return web3.eth.getBalancePromise(accounts[2])
        }).then(balance => {
            acct2beforeWeiBalance = balance
            return instance.withdraw({from: accounts[1], gasPrice: gasPrice})
        }).then(tx => {
            acct1weiUsed = tx.receipt.gasUsed * gasPrice
            return instance.withdraw({from: accounts[2], gasPrice: gasPrice})
        }).then(tx => {
            acct2weiUsed = tx.receipt.gasUsed * gasPrice
            return web3.eth.getBalancePromise(accounts[1])
        }).then(acct1afterWeiBalance => {
            assert.deepEqual(acct1beforeWeiBalance.minus(acct1weiUsed)
                .plus(web3.toBigNumber(acct1won)),
                acct1afterWeiBalance,
                "balance after withdrawal is incorrect")
            return web3.eth.getBalancePromise(accounts[2])
        }).then(acct2afterWeiBalance => {
            assert.deepEqual(acct2beforeWeiBalance.minus(acct2weiUsed)
                .plus(web3.toBigNumber(acct2won)),
                acct2afterWeiBalance,
                "balance after withdrawal is incorrect")
            return web3.eth.getBalancePromise(instance.address)
        }).then(balance => {
            assert.deepEqual(balance, web3.toBigNumber(0),
                "contract balance isn't 0 after all withdrawals")
        })
    })
})
