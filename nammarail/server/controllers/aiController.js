const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy-key');
const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: "You are NammaRail AI Assistant, a helpful assistant for the NammaRail train booking platform. Provide concise and accurate answers."
});

exports.streamAiResponse = async (req, res) => {
    const { history, prompt } = req.body;

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const chat = model.startChat({
            history: history || []
        });

        const result = await chat.sendMessageStream(prompt);
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
    } catch (err) {
        console.error('AI Stream Error:', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
        res.end();
    }
};
