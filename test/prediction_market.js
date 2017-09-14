let PredictionMarket = artifacts.require("./PredictionMarket.sol")
let Question = artifacts.require("./Question.sol")

require('bluebird').promisifyAll(web3.eth, { suffix: "Promise" })

function toHex64(str) {
    for (let i = str.length; i < 64 + 2; i++) {
        str += "0"
    }
    return str
}

function questionAddressAt(tx) {
    return tx.logs[0].args.questionAddress
}

contract("PredictionMarket", accounts => {

    let instance

    const questions = [toHex64("0x1"), toHex64("0x2"), toHex64("0x3")]
    const answers = [toHex64("0x1"), toHex64("0x2"), toHex64("0x3")]

    beforeEach(() => {
        return PredictionMarket.new().then(newInstance => {
            instance = newInstance
        })
    })

    it("should own its questions", () => {
        let question

        return instance.openQuestion(questions[0], answers).then(tx => {
            question = Question.at(questionAddressAt(tx))
            return question.owner()
        }).then(owner => {
            assert.equal(owner, instance.address, "question not owned by prediction market")
        })
    })

    it("should allow opening multiple questions", () => {
        let question1
        let question2

        return instance.openQuestion(questions[0], answers).then(tx => {
            question1 = Question.at(questionAddressAt(tx))
            return question1.waitQuestion()
        }).then(tx => {
            return question1.state()
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(1), "question state change failed")
            return instance.openQuestion(questions[1], answers)
        }).then(tx => {
            question2 = Question.at(questionAddressAt(tx))
            return question2.waitQuestion()
        }).then(tx => {
            return question2.state()
        }).then(state => {
            assert.deepEqual(state, web3.toBigNumber(1), "question state change failed")
        })
    })

    it("should allow question running state toggling", () => {
        let question

        return instance.openQuestion(questions[0], answers, {from: accounts[1]}).then(tx => {
            question = Question.at(questionAddressAt(tx))
            return instance.toggleQuestionRunning(questions[0], false)
        }).then(tx => {
            return question.running()
        }).then(running => {
            assert.equal(running, false, "question should not be running")
            return instance.toggleQuestionRunning(questions[0], true)
        }).then(tx => {
            return question.running()
        }).then(running => {
            assert.equal(running, true, "question should be running")
        })
    })
})
