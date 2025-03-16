function getEmojiForQuestion(selectedQuestion) {
  if (selectedQuestion.includes("games") || selectedQuestion.includes("pro_tips")) return "🎮";
  if (selectedQuestion.includes("languages") || selectedQuestion.includes("how_to_start")) return "💻";
  if (selectedQuestion.includes("design_tools") || selectedQuestion.includes("beginner_tips")) return "🎨";
  return "❓";
}

module.exports = { getEmojiForQuestion };