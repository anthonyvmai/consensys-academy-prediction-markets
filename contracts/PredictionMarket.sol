pragma solidity ^0.4.15;

import "./Owned.sol";

contract PredictionMarket is Owned {

    //////////////////////////
    //// DATA DEFINITIONS ////
    //////////////////////////

    // these question states are one way Open -> Waiting -> Answered
    enum QuestionState {
        Open, // still taking bets
        Waiting, // done taking bets but not yet answered and unable to withdraw
        Answered // answered and able to withdraw
    }

    struct Question {

        // how to check if question exists
        bool exists;

        // determines which actions can occur for a question
        QuestionState state;

        // actual answer can be stored offchain to avoid variable length data
        // keccack(answer string)
        bytes32 answer; // maybe make this fixed length unhashed ascii/utf-8?

        // (answer -> whether answer choice was set)
        mapping (bytes32 => bool) answerChoices;

        // (answer -> how much was bet to this answer)
        mapping (bytes32 => uint) answerBalances;

        // used for ease of payout calculation
        uint totalBet;

        // (betting user address -> (answer -> how much the user bet on this answer))
        // a user could conceivably change their mind and bet multiple ways
        mapping (address => mapping (bytes32 => uint)) userBalances;
    }

    ///////////////////////////
    //// STORAGE VARIABLES ////
    ///////////////////////////

    // only the market maker can open and answer questions
    // different from the owner, who can start and stop the contract
    address public maker;

    // actual question string can be stored offchain to avoid variable length data
    // (keccack256(question string) -> Question)
    mapping (bytes32 => Question) public questions;

    function PredictionMarket(address _maker) {
        maker = _maker;
    }

    /////////////////
    //// GETTERS ////
    /////////////////

    function getQuestionState(bytes32 questionHash)
        questionExists(questionHash)
        constant
        public
        returns (uint questionState) {

        return uint(questions[questionHash].state);
    }

    function getQuestionAnswer(bytes32 questionHash)
        questionExists(questionHash)
        constant
        public
        returns (bytes32 questionState) {

        require(questions[questionHash].state == QuestionState.Answered);

        return questions[questionHash].answer;
    }

    function getQuestionAnswerBalance(bytes32 questionHash, bytes32 answer)
        questionExists(questionHash)
        answerAllowed(questionHash, answer)
        constant
        public
        returns (uint questionAnswerBalance) {

        return questions[questionHash].answerBalances[answer];
    }

    function getQuestionUserAnswerBalance(bytes32 questionHash, address user, bytes32 answer)
        questionExists(questionHash)
        answerAllowed(questionHash, answer)
        constant
        public
        returns (uint questionUserAnswerBalance) {

        return questions[questionHash].userBalances[user][answer];
    }

    ////////////////
    //// EVENTS ////
    ////////////////

    event LogOpenQuestion(bytes32 questionHash, bytes32[] answerChoices);
    event LogWaitQuestion(bytes32 questionHash);
    event LogAnswerQuestion(bytes32 questionHash, bytes32 answer);

    event LogBet(bytes32 questionHash, address user, bytes32 answer, uint amount);
    event LogWithdraw(bytes32 questionHash, address user, uint amount);

    ///////////////////
    //// MODIFIERS ////
    ///////////////////

    modifier onlyMaker() {
        require(msg.sender == maker);

        _;
    }

    modifier questionExists(bytes32 questionHash) {
        // make sure they actually pass a value for the question
        require(questionHash != 0);

        // make sure the question exists in the `questions` mapping
        require(questions[questionHash].exists);

        _;
    }

    modifier answerAllowed(bytes32 questionHash, bytes32 answer) {
        // make sure they actually pass a value for the question
        require(questionHash !=0);

        // make sure they actually pass a value for the answer
        require(answer != 0);

        // make sure the answer is an allowed choice for the question
        require(questions[questionHash].answerChoices[answer]);

        _;
    }

    ///////////////////
    //// FUNCTIONS ////
    ///////////////////

    // questionHash should be the keccack256 of the question string
    // question state starts as `Open`
    function openQuestion(bytes32 questionHash, bytes32[] choices)
        onlyMaker
        public
        returns (bool success) {

        // make sure they actually pass a value for the question
        require(questionHash != 0);
        // make sure the question is new
        require(!questions[questionHash].exists);

        questions[questionHash] = Question({
            exists: true,
            state: QuestionState.Open,
            answer: 0,
            totalBet: 0
        });


        mapping(bytes32 => bool) choicesMap = questions[questionHash].answerChoices;

        for (uint i = 0; i < choices.length; i++) {
            choicesMap[choices[i]] = true;
        }

        LogOpenQuestion(questionHash, choices);

        return true;
    }

    // change question state from `Open` to `Wait`
    function waitQuestion(bytes32 questionHash)
        onlyMaker
        questionExists(questionHash)
        public
        returns (bool success) {

        Question storage question = questions[questionHash];

        require(question.state == QuestionState.Open);

        question.state = QuestionState.Waiting;

        LogWaitQuestion(questionHash);

        return true;
    }

    // change question state from `Wait` to `Answered`
    function answerQuestion(bytes32 questionHash, bytes32 answer)
        onlyMaker
        questionExists(questionHash)
        answerAllowed(questionHash, answer)
        public
        returns (bool success) {

        Question storage question = questions[questionHash];

        require(question.state == QuestionState.Open || question.state == QuestionState.Waiting);

        question.state = QuestionState.Answered;
        question.answer = answer;

        LogAnswerQuestion(questionHash, answer);

        return true;
    }

    // only allowed if question state is `Open`
    function bet(bytes32 questionHash, bytes32 answer)
        questionExists(questionHash)
        answerAllowed(questionHash, answer)
        public
        payable
        returns (bool success) {

        require(msg.value > 0);

        Question storage question = questions[questionHash];

        require(question.state == QuestionState.Open);

        question.totalBet += msg.value;
        question.answerBalances[answer] += msg.value;
        question.userBalances[msg.sender][answer] += msg.value;

        LogBet(questionHash, msg.sender, answer, msg.value);

        return true;
    }

    // only allowed if question state is `Answered`
    function withdraw(bytes32 questionHash)
        questionExists(questionHash)
        public
        returns (bool success) {

        Question storage question = questions[questionHash];

        require(question.state == QuestionState.Answered);

        // TODO: how to avoid losing the decimal remainder
        uint amount = (question.userBalances[msg.sender][question.answer] * question.totalBet)
            / question.answerBalances[question.answer];

        // disallow double withdrawal
        // the balances for wrong answers can stay non-zero because they're not used
        question.userBalances[msg.sender][question.answer] = 0;

        msg.sender.transfer(amount);

        LogWithdraw(questionHash, msg.sender, amount);

        return true;
    }
}
