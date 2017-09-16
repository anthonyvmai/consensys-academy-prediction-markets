pragma solidity ^0.4.15;

import "./Owned.sol";
import "./Question.sol";

contract PredictionMarket is Owned {

    // actual question string can be stored offchain to avoid variable length data
    // (keccack256(question string) -> Question)
    mapping (bytes32 => Question) public questions;

    event LogOpenQuestion(bytes32 questionHash,
                          address questionAddress,
                          address askerAnswerer,
                          bytes32[] answerChoices);
    event LogToggleQuestionRunning(bytes32 questionHash, bool running);

    // questionHash should be the keccack256(question string)
    // question state starts as `Open`
    function openQuestion(bytes32 questionHash, bytes32[] choices)
        onlyIfRunning
        public
        returns (address questionAddress) {

        // make sure they actually pass a value for the question
        require(questionHash != 0);
        // make sure the question is new
        require(address(questions[questionHash]) == 0);

        Question question = new Question(questionHash, msg.sender, choices);
        questions[questionHash] = question;

        LogOpenQuestion(questionHash, address(question), msg.sender, choices);

        return question;
    }

    function toggleQuestionRunning(bytes32 questionHash, bool running)
        onlyIfRunning
        onlyOwner
        public
        returns (bool success) {

        Question question = questions[questionHash];

        require(address(question) != 0);

        LogToggleQuestionRunning(questionHash, running);

        question.toggleRunning(running);
        return true;
    }
}
