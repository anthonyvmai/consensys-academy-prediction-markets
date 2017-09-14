pragma solidity ^0.4.15;

import "./Owned.sol";

contract Question is Owned {

    // these question states are one way Open -> Waiting -> Answered
    enum QuestionState {
        Open, // still taking bets
        Waiting, // done taking bets but not yet answered and unable to withdraw
        Answered // answered and able to withdraw
    }

    // only one who can change question state
    address public askerAnswerer;

    // keccack256(question string), actual question stored offchain
    bytes32 public questionHash;

    // determines which actions can occur for a question
    QuestionState public state;

    // actual answer can be stored offchain to avoid variable length data
    // keccack(answer string)
    bytes32 public theAnswer; // maybe make this fixed length unhashed ascii/utf-8?

    // (answer -> whether answer is an allowed choice)
    mapping (bytes32 => bool) public answerChoices;

    // (answer -> how much was bet to this answer)
    mapping (bytes32 => uint) public answerBalances;

    // used for ease of payout calculation
    uint public totalBet;

    // (betting user address -> (answer -> how much the user bet on this answer))
    // a user could conceivably change their mind and bet multiple ways
    mapping (address => mapping (bytes32 => uint)) public userBalances;

    // constructor
    function Question(bytes32 _questionHash, address _askerAnswerer, bytes32[] choices)
        public {

        questionHash = _questionHash;
        askerAnswerer = _askerAnswerer;
        state = QuestionState.Open;

        for (uint i = 0; i < choices.length; i++) {
            answerChoices[choices[i]] = true;
        }
    }

    // whether the answer is in the mapping of choices
    modifier answerAllowed(bytes32 answer) {
        // make sure they actually pass a value for the answer
        require(answer != 0);

        // make sure the answer is an allowed choice for the question
        require(answerChoices[answer]);

        _;
    }

    modifier onlyAskerAnswerer() {
        require(msg.sender == askerAnswerer);

        _;
    }

    event LogWaitQuestion();
    event LogAnswerQuestion(bytes32 answer);
    event LogBet(address user, bytes32 answer, uint amount);
    event LogWithdraw(address user, uint amount);

    // getter for nested mapping `userBalances`
    function getUserAnswerBalance(address user, bytes32 answer)
        answerAllowed(answer)
        constant
        public
        returns (uint userAnswerBalance) {

        return userBalances[user][answer];
    }

    // change question state from `Open` to `Wait`
    function waitQuestion()
        onlyIfRunning
        onlyAskerAnswerer
        public
        returns (bool success) {

        require(state == QuestionState.Open);

        state = QuestionState.Waiting;

        LogWaitQuestion();

        return true;
    }

    // change question state from `Wait` to `Answered`
    function answerQuestion(bytes32 answer)
        onlyIfRunning
        onlyAskerAnswerer
        answerAllowed(answer)
        public
        returns (bool success) {

        require(state == QuestionState.Open || state == QuestionState.Waiting);

        state = QuestionState.Answered;
        theAnswer = answer;

        LogAnswerQuestion(answer);

        return true;
    }

    // only allowed if question state is `Open`
    function bet(bytes32 answer)
        onlyIfRunning
        answerAllowed(answer)
        public
        payable
        returns (bool success) {

        require(msg.value > 0);
        require(state == QuestionState.Open);

        totalBet += msg.value;
        answerBalances[answer] += msg.value;
        userBalances[msg.sender][answer] += msg.value;

        LogBet(msg.sender, answer, msg.value);

        return true;
    }

    // only allowed if question state is `Answered`
    function withdraw()
        onlyIfRunning
        public
        returns (bool success) {

        require(state == QuestionState.Answered);
        require(userBalances[msg.sender][theAnswer] != 0);

        // TODO: how to avoid losing the decimal remainder
        uint amount = (userBalances[msg.sender][theAnswer] * totalBet) / answerBalances[theAnswer];

        // disallow double withdrawal
        // the balances for wrong answers can stay non-zero because they're not used
        userBalances[msg.sender][theAnswer] = 0;

        msg.sender.transfer(amount);

        LogWithdraw(msg.sender, amount);

        return true;
    }
}
