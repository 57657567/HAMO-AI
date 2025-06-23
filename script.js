// DOM Elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const finalTranscriptElem = document.getElementById('finalTranscript');
const interimTranscriptElem = document.getElementById('interimTranscript');
const customerSpeechElem = document.getElementById('customerSpeech');
const customerSpeechTranslatedElem = document.getElementById('customerSpeechTranslated');
const sentimentElem = document.getElementById('sentiment');
const intentElem = document.getElementById('intent');
const suggestedReplyElem = document.getElementById('suggestedReply');
const agentReplyElem = document.getElementById('agentReply');
const copyReplyButton = document.getElementById('copyReply');
const useCannedButton = document.getElementById('useCanned');
const cannedResponsesSelect = document.getElementById('cannedResponsesSelect');
const diffOutputElem = document.getElementById('diffOutput');
const jobContextElem = document.getElementById('jobContext');
const statusBar = document.getElementById('statusBar');
const sendReplyButton = document.getElementById('sendReplyButton'); // Get the Send Reply button

// --- API KEYS & CONFIG ---
// WARNING: These keys are visible in client-side code. For personal use only.
// DO NOT deploy this to a public server with real keys.
const GEMINI_API_KEY = "AIzaSyBNMPsHNr6f6Gn1p_tXJvHrogy_BjWVcIc";

// MODIFIED: Reduced pause delay for faster AI triggering after speech stops
const SPEECH_PAUSE_DELAY = 1500; // ms (reduced from 2500ms)

// --- Microphone and Speech Recognition Variables ---
let recognition; // Use 'let' so we can reassign or nullify
let isListening = false;
let isProcessingAI = false; // Flag to indicate if AI processing is active
let finalTranscript = '';
let interimTranscript = '';
let speechTimeout; // Timer for detecting pauses in speech
let isManuallyStopped = false; // Flag to track if stop button was clicked

// Ensure SpeechRecognition API is available
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    updateStatus('متصفحك لا يدعم التعرف على الكلام. الرجاء استخدام جوجل كروم.', 'error');
    startButton.disabled = true;
}

// Canned Responses (example data)
const cannedResponses = {
    'ترحيب عام': 'مرحباً بك! كيف يمكنني مساعدتك اليوم؟',
    'طلب معلومات': 'لمساعدتك بشكل أفضل، هل يمكنك تزويدي بمزيد من التفاصيل حول طلبك؟',
    'حل مشكلة فنية': 'أتفهم أنك تواجه مشكلة فنية. دعنا نحاول استكشاف الأخطاء وإصلاحها معاً.',
    'اعتذار': 'نعتذر عن أي إزعاج قد تكون واجهته. نحن نعمل على حل المشكلة في أقرب وقت ممكن.',
    'تأكيد إنهاء المكالمة': 'شكراً لاتصالك بمركز الاتصال الخاص بنا. هل هناك أي شيء آخر يمكنني مساعدتك به؟'
};

// Function to handle pauses in speech and trigger AI processing
const handleSpeechPause = () => {
    const transcriptToProcess = finalTranscript.trim();
    // Only process if there's actual speech and no AI processing is already happening
    if (transcriptToProcess.length > 0 && !isProcessingAI) {
        console.log("Speech pause detected. Processing final transcript segment:", transcriptToProcess);
        processFinalTranscriptSegment(transcriptToProcess);
        finalTranscript = ''; // Clear final transcript after sending for processing
        interimTranscriptElem.textContent = ''; // Clear interim display
        interimTranscript = ''; // Clear interim variable
    }
};
// --- End Microphone and Speech Recognition Variables & handleSpeechPause ---


// --- Core Functions ---

function updateStatus(message, type = 'idle', state = 'idle') {
    statusBar.textContent = message;
    statusBar.className = 'status-bar'; // Reset
    statusBar.classList.add(`status-${type}`);

    // Only update isProcessingAI state if state param is explicitly provided
    if (state === 'processing') {
         isProcessingAI = true;
    } else if (state === 'idle') {
         isProcessingAI = false;
    }
    // If state is not explicitly 'processing' or 'idle', keep current isProcessingAI state


    // Manage button disabled state based on current isListening and isProcessingAI flags
    startButton.disabled = isListening || isProcessingAI;
    stopButton.disabled = !isListening || isProcessingAI;
}

// --- MODIFIED callLLM Function (Gemini Exclusive, always Flash) ---
async function callLLM(task, text, context = '', modelOverride = null) { // Removed isGemini param
    let payload;
    let apiUrl;
    let headers = { 'Content-Type': 'application/json' };

    const jobContext = jobContextElem.value || 'General customer service. Be polite and professional.';
    let fullPrompt = `Job Context: ${jobContext}\n\n`;

    // MODIFIED: Always use gemini-2.0-flash unless overridden
    const selectedGeminiModel = modelOverride || 'gemini-2.0-flash';


    switch (task) {
        case 'extract':
            fullPrompt += `Given the following conversation transcript, identify and extract only the text spoken by the customer. Ignore any parts that seem to be the agent's speech or background noise. If no clear customer speech is present, return the original text. Provide ONLY the customer's speech, no other text or formatting.\n\nTranscript: "${text}"`;
            // Model already defaults to gemini-2.0-flash or uses override
            break;
        case 'translate':
            // Refined Translation Prompt
            fullPrompt += `Translate the following English text to Arabic. Provide only the Arabic translation:\n\nEnglish: "${text}"\nArabic:`;
            // Model already defaults to gemini-2.0-flash or uses override
            break;
        case 'sentiment':
            fullPrompt += `Analyze the sentiment of the following text. Respond with only one word: "Positive", "Negative", or "Neutral".\n\nText: "${text}"\nSentiment:`;
             // Model already defaults to gemini-2.0-flash or uses override
            break;
        case 'intent':
            fullPrompt += `Classify the intent of the following customer query into one of these categories: "General Inquiry", "Technical Support", "Billing Issue", "Product Information", "Order Status", "Complaint", "Feedback", "Other". Focus solely on the category.\n\nQuery: "${text}"\nIntent:`;
             // Model already defaults to gemini-2.0-flash or uses override
            break;
        case 'suggest':
            fullPrompt += `You are an expert call center agent. Based on the customer's speech and the work context provided, provide the best, most professional, and concise reply in English. Ensure the reply is grammatically correct and polished. Provide only the reply, do not include any conversational filler like "Here is a suggestion:".\n\nCustomer Input: "${text}"\nPolite Reply:`;
             // Model already defaults to gemini-2.0-flash or uses override
            break;
        default:
            console.error("Unknown AI task:", task);
            return null;
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
        console.error('Gemini API key is missing or invalid.');
        throw new Error('Gemini API key is not configured.');
    }
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedGeminiModel}:generateContent?key=${GEMINI_API_KEY}`;
    payload = { contents: [{ role: "user", parts: [{ text: fullPrompt }] }] };


    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`API Error Response for task "${task}":`, errorData); // Enhanced error log
            throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log(`Raw API response for task "${task}" (Gemini):`, data); // Crucial log

        let responseText = null;
         // Corrected response parsing for Gemini structure
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            responseText = data.candidates[0].content.parts[0].text;
        } else {
            console.error("Gemini response structure unexpected or empty for task", task, ":", data); // Added specific error log
            // Provide more info if generation feedback is available
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                console.error("Gemini prompt feedback block reason:", data.promptFeedback.blockReason);
                // You might want to surface this to the user
            }
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].finishReason) {
                 console.error("Gemini candidate finish reason:", data.candidates[0].finishReason);
            }
            throw new Error('Gemini returned no valid response or unexpected structure.');
        }

        if (responseText) {
            console.log(`Successfully extracted response text for task "${task}":`, responseText.trim()); // Log successful extraction
            return responseText.trim();
        } else {
             // This case should be covered by the checks above, but as a safeguard:
            console.error(`Failed to extract text from Gemini response for task "${task}". ResponseText is null or empty. Raw data:`, data); // Log why extraction failed
            throw new Error(`Failed to extract text from Gemini response.`);
        }

    } catch (error) {
        console.error(`Error in callLLM for task "${task}" with Gemini:`, error);
        throw error; // Re-throw to be caught by processFinalTranscriptSegment
    }
}
// --- END MODIFIED callLLM Function ---

// Ensure `processFinalTranscriptSegment` is defined correctly BEFORE `startListening` calls it
async function processFinalTranscriptSegment(transcript) {
    if (isProcessingAI) {
        console.warn("AI processing already in progress. Skipping new segment.");
        return;
    }
    updateStatus('جاري تحليل الصوت بالنص...', 'processing', 'processing'); // Set status to processing

    try {
        // Use callLLM with Gemini Flash for extraction
        const extractedSpeech = await callLLM('extract', transcript, null, 'gemini-2.0-flash').catch(e => {
            console.error("Error during extraction:", e);
            return null; // Return null on error
        });
        customerSpeechElem.value = extractedSpeech || "لم يتم استخلاص كلام العميل بوضوح.";

        // If customer speech is extracted, proceed with other AI tasks in parallel
        if (extractedSpeech && extractedSpeech.trim() !== '' && extractedSpeech !== "لم يتم استخلاص كلام العميل بوضوح.") {

            // Run translation, sentiment, intent, and suggestion in parallel using gemini-2.0-flash
            const [translated, sentiment, intent, suggestion] = await Promise.all([
                callLLM('translate', extractedSpeech, null, 'gemini-2.0-flash').catch(e => { // MODIFIED: Use gemini-2.0-flash
                    console.error("Translation API Error:", e); // Specific error log for translation
                    return null;
                }),
                callLLM('sentiment', extractedSpeech, null, 'gemini-2.0-flash').catch(e => {
                    console.error("Sentiment API Error:", e); // Specific error log for sentiment
                    return null;
                }),
                callLLM('intent', extractedSpeech, null, 'gemini-2.0-flash').catch(e => {
                    console.error("Intent API Error:", e); // Specific error log for intent
                    return null;
                }),
                callLLM('suggest', extractedSpeech, jobContextElem.value, 'gemini-2.0-flash').catch(e => { // MODIFIED: Ensure gemini-2.0-flash
                    console.error("Suggestion API Error:", e); // Specific error log for suggestion
                    return null;
                })
            ]);

            customerSpeechTranslatedElem.value = translated || 'فشل في الترجمة.'; // Update textarea value
            sentimentElem.textContent = sentiment || 'غير محدد';
            intentElem.textContent = intent || 'غير محدد';
            suggestedReplyElem.value = suggestion || 'لم يتمكن من إنشاء رد.'; // This should now populate

            const sentimentColors = {
                "Positive": "#10b981", "Negative": "#ef4444", "Neutral": "#3b82f6"
            };
            sentimentElem.style.color = sentimentColors[sentiment] || 'var(--text-color)';

            updateStatus('اكتمل التحليل', 'success');
        } else {
            // If extraction failed or was empty
            updateStatus('فشل التحليل: لم يتم اكتشاف كلام للعميل.', 'info', 'idle');
            customerSpeechTranslatedElem.value = "الترجمة ستظهر هنا...";
            sentimentElem.textContent = "جاري التحليل...";
            intentElem.textContent = "جاري التحليل...";
            suggestedReplyElem.value = "سيظهر الرد المقترح من الذكاء الصناعي سيظهر هنا...";
            sentimentElem.style.color = 'var(--text-color)';
        }
    } catch (e) {
        console.error("Error processing final transcript segment:", e);
        updateStatus(`خطأ في التحليل: ${e.message}`, 'error');
    } finally {
        // isProcessingAI flag is managed by updateStatus calls with state param
        // Reset status after a delay if not actively listening AND not processing AI
        setTimeout(() => { if (!isListening && !isProcessingAI) updateStatus('جاهز', 'idle'); }, 3000);
    }
}


// --- REWRITTEN startListening Function (Enhanced Permission/Stability) ---
const startListening = async () => {
    if (isListening) {
        console.log("Already listening. Ignoring start request.");
        return; // Prevent starting if already active
    }

    // Reset the manual stop flag
    isManuallyStopped = false;

    // Clear previous data and UI elements for a fresh start
    finalTranscript = ''; // Clear final transcript variable
    interimTranscript = ''; // Clear interim transcript variable
    finalTranscriptElem.textContent = ''; // Clear final transcript display
    interimTranscriptElem.textContent = ''; // Clear interim transcript display
    customerSpeechElem.value = ''; // Clear customer speech textarea
    customerSpeechTranslatedElem.value = ''; // Clear translated speech textarea
    sentimentElem.textContent = '...'; // Reset sentiment display
    intentElem.textContent = '...'; // Reset intent display
    suggestedReplyElem.value = 'سيظهر الرد المقترح من الذكاء الصناعي سيظهر هنا...'; // Reset to original placeholder
    agentReplyElem.value = ''; // Clear agent reply textarea
    displayDiff(); // Update diff display
    sentimentElem.style.color = 'var(--text-color)'; // Reset sentiment color

    updateStatus('جاري طلب إذن الميكروفون...', 'info'); // Indicate permission request
    startButton.disabled = true; // Disable start button immediately
    stopButton.disabled = true; // Disable stop button until listening starts

    try {
        let permissionState = 'prompt'; // Assume prompt initially

        // --- Check current microphone permission state ---
        // Ensure navigator.permissions and query method are available
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            try {
                const permissionStatus = await navigator.permissions.query({ name: "microphone" });
                permissionState = permissionStatus.state;
                console.log("Microphone permission state from query:", permissionState);

                // If permission is already granted, we don't need to call getUserMedia again.
                // Proceed directly to starting recognition if it's granted.
                if (permissionState === 'granted') {
                    console.log("Microphone permission already granted. Proceeding to start recognition.");
                     // Initialize recognition instance if not already.
                     if (!recognition) {
                          initializeRecognition(); // Call a helper function to set up recognition instance and handlers
                     }
                     // Attempt to start recognition
                     try {
                          recognition.start();
                         // onstart handler will update status and buttons
                     } catch (startErr) {
                         console.error("Error calling recognition.start() after permission granted:", startErr);
                         handleRecognitionStartError(startErr); // Handle start error
                     }
                     return; // Exit startListening after attempting to start recognition
                }
            } catch (queryErr) {
                 console.warn("navigator.permissions.query failed, falling back to getUserMedia:", queryErr);
                 // Fallback: If query fails (e.g., browser doesn't support query for 'microphone'),
                 // proceed to getUserMedia which will prompt if needed.
            }
        } else {
             console.warn("navigator.permissions API or query method not available. Will rely on getUserMedia to prompt for permission.");
        }
        // --- End permission check ---


        // If permission is not granted ('prompt' or 'denied' from query, or query failed/not supported), call getUserMedia to prompt or fail
        console.log(`Microphone permission state is '${permissionState}' or query failed. Calling getUserMedia...`);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the tracks after confirming access, as SpeechRecognition manages its own stream.
        stream.getTracks().forEach(track => track.stop());
        console.log("Microphone access obtained via getUserMedia and stream stopped.");


        // Initialize SpeechRecognition instance if not already (should be null if we reach here without permission granted)
        if (!recognition) {
            initializeRecognition(); // Call helper function
        }

         // Attempt to start recognition
         try {
             recognition.start();
             // onstart handler will update status and buttons
        } catch (startErr) {
             console.error("Error calling recognition.start() after getUserMedia:", startErr);
             handleRecognitionStartError(startErr); // Handle start error
        }


    } catch (err) {
        // Handle errors from getUserMedia or permission check (microphone access denial/failure)
        console.error("Failed during microphone permission check or getUserMedia:", err);
        clearTimeout(speechTimeout); // Clear any pending timeout
        isListening = false; // Ensure listening state is false
        isProcessingAI = false; // Ensure AI processing state is false
         recognition = null; // Clear recognition instance if mic access failed

        let errorMessage = 'فشل بدء الاستماع. تحقق من توصيل الميكروفون وإذن الوصول.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = 'تم رفض الوصول إلى الميكروفون. يرجى السماح بالوصول في إعدادات المتصفح.';
        } else if (err.name === 'NotFoundError') {
            errorMessage = 'لم يتم العثور على ميكروفون. يرجى توصيل ميكروفون.';
        } else if (err.name === 'TypeError') {
             errorMessage = 'خطأ في نوع الجهاز. قد تكون هناك مشكلة في إعدادات الصوت.';
        } else if (err.name === 'AbortError') {
             errorMessage = 'تم إلغاء طلب الوصول إلى الميكروفون.';
        }


        updateStatus(errorMessage, 'error');
        startButton.disabled = false;
        stopButton.disabled = true;
    }
};
// --- END REWRITTEN startListening Function ---

// --- Helper function to initialize SpeechRecognition instance and handlers ---
const initializeRecognition = () => {
     console.log("Initializing new SpeechRecognition instance.");
     recognition = new SpeechRecognition();
     recognition.lang = 'en-US'; // Set language to English for recognition
     recognition.continuous = true; // Enable continuous recognition
     recognition.interimResults = true; // Show interim results

     recognition.onstart = () => {
         isListening = true;
         // Status update and button states are managed by startListening's success path
         updateStatus('يستمع الآن...', 'listening');
         startButton.disabled = true;
         stopButton.disabled = false;
         console.log("Speech recognition started.");
     };

     recognition.onresult = (event) => {
         clearTimeout(speechTimeout); // Reset silence timer

         let interimResult = '';
         let finalResult = '';

         // Process all results from this event
         for (let i = event.resultIndex; i < event.results.length; ++i) {
             const transcriptPart = event.results[i][0].transcript;
             if (event.results[i].isFinal) {
                 finalResult += transcriptPart + ' ';
             } else {
                 interimResult += transcriptPart;
             }
         }

         finalTranscript += finalResult; // Accumulate final transcript
         interimTranscript = interimResult; // Update interim transcript

         finalTranscriptElem.textContent = finalTranscript;
         interimTranscriptElem.textContent = interimTranscript;

         // Trigger processing timeout if new final text or significant interim exists
         if (finalResult.trim().length > 0 || interimTranscript.trim().length > 15) {
              speechTimeout = setTimeout(handleSpeechPause, SPEECH_PAUSE_DELAY);
         }
     };

     recognition.onend = () => {
         console.log("Speech recognition ended. isListening:", isListening, "isManuallyStopped:", isManuallyStopped);
         clearTimeout(speechTimeout); // Clear any pending timeout

         // Process any remaining final transcript segment
         const transcriptToProcess = finalTranscript.trim();
         if (transcriptToProcess.length > 0 && !isProcessingAI) {
             processFinalTranscriptSegment(transcriptToProcess); // This handles clearing finalTranscript
             // interim transcript is cleared in handleSpeechPause or stopListening
         } else {
             // If no transcript was processed, just ensure interim display is clear
             interimTranscriptElem.textContent = '';
             interimTranscript = '';
         }

         // CRITICAL: If 'isListening' is still true AND it was NOT manually stopped, attempt restart.
         // isListening should be true ONLY if onend was triggered unexpectedly while we intended to be listening.
         if (isListening && !isManuallyStopped) {
             console.log("Recognition ended unexpectedly, attempting restart...");
             updateStatus('جاري إعادة تشغيل الاستماع...', 'info');
             // Add a small delay before attempting restart to prevent immediate errors
             setTimeout(() => {
                 // Double check flags before restarting - state might have changed during timeout
                 // Check recognition is not null - could be nullified by a fatal error that fired before onend
                 if (isListening && !isManuallyStopped && recognition) {
                     try {
                         recognition.start();
                         console.log("Recognition restart attempted.");
                     } catch (restartErr) {
                         console.error("Failed to restart Speech Recognition:", restartErr);
                         updateStatus('فشل في إعادة تشغيل الاستماع.', 'error');
                         isListening = false; // Ensure state is false if restart fails
                         startButton.disabled = false;
                         stopButton.disabled = true;
                         recognition = null; // Important: nullify if restart fails to allow fresh start
                     }
                 } else {
                     // If isListening became false or isManuallyStopped became true during timeout, finalize state.
                     console.log("Restart aborted: isListening is false, isManuallyStopped is true, or recognition is null.");
                     if (!isProcessingAI) updateStatus('تم الإيقاف', 'idle'); // Ensure final status if processing is done
                     startButton.disabled = false;
                     stopButton.disabled = true;
                 }
             }, 500); // 500ms delay
         } else {
             // If stopped intentionally (`isManuallyStopped` is true, `isListening` is false)
             console.log("Recognition ended due to manual stop or previous error.");
             recognition = null; // Nullify recognition for a clean state on next manual start
             // Status and button states are handled by stopListening after it calls recognition.stop()
             // Or by the error handler if it was a fatal error.
         }
     };

     recognition.onerror = (event) => {
         console.error("Speech Recognition Error:", event.error);
         clearTimeout(speechTimeout); // Clear timeout on error

         let errorMessage = `خطأ في الاستماع: ${event.error}`;
         let statusType = 'error';
         let shouldNullifyRecognition = false; // Flag to indicate if recognition object is broken
         let shouldManuallyResume = false; // Flag for errors requiring user click to resume

         // Fatal errors that require user intervention or a fresh start
         const fatalErrors = ['not-allowed', 'audio-capture', 'network', 'service-not-allowed', 'language-not-supported'];

         if (fatalErrors.includes(event.error)) {
             if (event.error === 'not-allowed') errorMessage = 'خطأ: تم رفض إذن الميكروفون. يرجى السماح للموقع بالوصول إلى الميكروفون في إعدادات المتصفح.';
             else if (event.error === 'audio-capture') errorMessage = 'خطأ في التقاط الصوت. تأكد من توصيل الميكروفون واختياره بشكل صحيح.';
             else if (event.error === 'network') errorMessage = 'خطأ في الشبكة أثناء التعرف على الكلام. يرجى التحقق من اتصالك بالإنترنت.';
             else if (event.error === 'service-not-allowed') errorMessage = 'الخدمة غير مسموح بها. قد تكون محظورة من قبل إعدادات النظام أو الشبكة.';
             else if (event.error === 'language-not-supported') errorMessage = 'اللغة المحددة غير مدعومة.';

             console.error(`Fatal Speech Recognition Error: ${event.error}. Stopping recognition.`);
             shouldNullifyRecognition = true; // Recognition object is likely unusable
             shouldManuallyResume = true; // User must click start

         } else if (event.error === 'no-speech') {
             errorMessage = 'لم يتم الكشف عن كلام. الميكروفون متوقف مؤقتًا. انقر "بدء الاستماع" للاستئناف.'; // Inform user how to restart
             statusType = 'info';
             shouldManuallyResume = true; // User must click start
             console.log("No speech detected. Treating as temporary pause requiring manual resume.");
             // Do NOT nullify recognition here, it's still potentially usable.
             // Do NOT automatically restart. Let onend handle state transition.

         } else if (event.error === 'aborted') {
             errorMessage = 'تم إلغاء التعرف على الكلام. الميكروفون متوقف مؤقتًا. انقر "بدء الاستماع" للاستئناف.'; // Inform user how to restart
             statusType = 'info';
             shouldManuallyResume = true; // User must click start
             console.log("Recognition aborted. Treating as temporary pause requiring manual resume.");
             // Do NOT nullify recognition here, it's still potentially usable.
             // Do NOT automatically restart. Let onend handle state transition.

         } else if (event.error === 'bad-grammar') {
             errorMessage = 'خطأ في القواعد (Bad Grammar).';
             statusType = 'info';
             console.log("Bad grammar error.");
             // Not fatal, doesn't require manual restart, onend will handle potential restart if continuous
             updateStatus(errorMessage, statusType); // Just update status and exit
             return;
         }

         // For errors that require manual resume ('no-speech', 'aborted') or are fatal:
         if (shouldManuallyResume) {
              // Ensure listening state is false
              isListening = false;
              // Update status
              updateStatus(errorMessage, statusType, 'idle'); // Set state to idle
              // Ensure buttons are correctly enabled/disabled
              startButton.disabled = false;
              stopButton.disabled = true;

              // Process any pending transcript before cleaning up recognition
              const transcriptToProcess = finalTranscript.trim();
              if (transcriptToProcess.length > 0 && !isProcessingAI) {
                  processFinalTranscriptSegment(transcriptToProcess); // This handles clearing finalTranscript
                   // interim transcript is cleared in handleSpeechPause or below
              }
              // Clear interim display immediately
              interimTranscriptElem.textContent = '';
              interimTranscript = '';

              // Nullify recognition object for fatal errors or if needed for clean restart
              if (shouldNullifyRecognition) {
                  if (recognition) recognition.stop(); // Ensure stop is called before nullifying on fatal errors
                  recognition = null;
              }
              // Note: For 'no-speech'/'aborted', recognition is NOT nullified here,
              // allowing recognition.start() to be called directly on the existing object by the user.
         }
         // For non-manual errors (like bad-grammar), onend will fire, potentially triggering a restart if !isManuallyStopped
     };
 };
 // --- End Initialize Recognition Helper ---

 // --- Helper function to handle errors when calling recognition.start() ---
 const handleRecognitionStartError = (startErr) => {
     console.error("Error calling recognition.start():", startErr);
     clearTimeout(speechTimeout); // Clear timeout on start failure
     isListening = false; // Ensure state is false

     let errorMessage = 'فشل بدء الاستماع الميكروفون.';
     // Check if the error indicates it was already started (common if button clicked rapidly)
     if (startErr.message.includes("already started")) {
          errorMessage = 'الاستماع نشط بالفعل.';
          isListening = true; // Correct the state if it was already started
          // Update status and button states to reflect that it IS listening
          updateStatus('يستمع الآن...', 'listening');
          startButton.disabled = true;
          stopButton.disabled = false;
          return; // Exit if it was just already started
     }

     // For other start errors
     updateStatus(errorMessage, 'error');
     // Re-enable buttons if start failed and not already listening
     startButton.disabled = false;
     stopButton.disabled = true;
     recognition = null; // Nullify for clean restart next time
 };
 // --- End handleRecognitionStartError Helper ---


// --- REWRITTEN stopListening Function (Enhanced Cleanup) ---
const stopListening = () => {
    // If not actively listening and no pending AI processing/transcript, nothing to stop
    if (!isListening && !isProcessingAI && finalTranscript.trim().length === 0) {
        updateStatus('ليس هناك شيء لإيقافه.', 'info');
        return;
    }

    console.log("Attempting to stop listening. Current state: isListening=", isListening, "isProcessingAI=", isProcessingAI, "finalTranscript length=", finalTranscript.trim().length);

    isManuallyStopped = true; // Set this flag FIRST to indicate user intent
    isListening = false; // Update listening state immediately

    // Indicate stopping in UI, but only if not currently processing AI.
    // If processing AI, the status will switch to 'idle' after AI finishes.
    if (!isProcessingAI) {
        updateStatus('جاري الإيقاف...', 'info');
    }

    if (recognition) {
        console.log("Calling recognition.stop()...");
        recognition.stop(); // This will trigger the `onend` event.
        // The cleanup (recognition = null for manual stop) and final status update happens in `onend`.
        // Do NOT nullify recognition here; let `onend` handle it for proper lifecycle.
    } else if (finalTranscript.trim().length > 0 && !isProcessingAI) {
        // If recognition object is null (e.g., due to an error before starting)
        // but there's a pending transcript, process it.
        console.log("Recognition not active, but pending transcript exists. Processing last segment.");
        clearTimeout(speechTimeout);
        processFinalTranscriptSegment(finalTranscript.trim()).finally(() => {
            // After processing the last chunk, if not listening and not processing AI, set status to idle
            if (!isListening && !isProcessingAI) updateStatus('تم الإيقاف', 'idle');
        });
        finalTranscript = ''; // Clear transcript variable
        interimTranscriptElem.textContent = ''; // Clear display
        interimTranscript = ''; // Clear variable
        // Since `recognition` was already null, enable buttons here
        startButton.disabled = false;
        stopButton.disabled = true;
    } else {
        // If nothing to stop (no listening, no pending transcript, no AI processing)
        console.log("stopListening called but no active state found to explicitly stop.");
        clearTimeout(speechTimeout);
        // Status should already be idle or error if nothing was active/processing
        if (!isProcessingAI) updateStatus('تم الإيقاف', 'idle'); // Fallback status update
        startButton.disabled = false;
        stopButton.disabled = true;
        // `recognition` should already be null or handled by a previous error state.
    }
    // Button states and final status update are now primarily handled by onend (for recognition.stop)
    // or the specific else blocks above.
};
// --- END REWRITTEN stopListening Function ---


// --- MODIFIED displayDiff Function ---
const displayDiff = () => {
    const suggested = suggestedReplyElem.value;
    const agent = agentReplyElem.value;
    // Adjusted placeholders to match current HTML and logic
    const placeholderSuggested = 'سيظهر الرد المقترح من الذكاء الصناعي سيظهر هنا...';
    const placeholderAgent = 'اكتب ردك هنا أو انسخ الرد المقترح...';

    // Determine the actual text for comparison, treating specific placeholders as empty
    const textSuggested = (suggested === placeholderSuggested || !suggested) ? '' : suggested;
    const textAgent = (agent === placeholderAgent || !agent) ? '' : agent;


    // If both are effectively empty, show no comparison message
    if (!textSuggested && !textAgent) {
         diffOutputElem.innerHTML = 'لا توجد مقارنة حتى الآن.';
         return;
    }

    // Check if Diff library is available
    if (typeof Diff === 'undefined') {
         diffOutputElem.innerHTML = 'خطأ: مكتبة Diff غير متوفرة.';
         return;
    }

    // Calculate the diff
    const diff = Diff.diffWords(textSuggested, textAgent);
    const fragment = document.createDocumentFragment();

    if (diff.length === 0 && textSuggested === textAgent) {
         // If identical and not empty, show the text
         fragment.appendChild(document.createTextNode(textSuggested || 'الردود متطابقة.'));
    }
    else if (diff.length === 0) {
         // This case should ideally not happen if inputs differ, but as a fallback:
         fragment.appendChild(document.createTextNode('الردود مختلفة ولا يمكن عرض المقارنة.'));
    }
    else {
        // Build the diff HTML fragment
        diff.forEach(part => {
            // green for additions, red for deletions, default span for common parts
            const color = part.added ? 'ins' : part.removed ? 'del' : 'span';
            const node = document.createElement(color);
            node.appendChild(document.createTextNode(part.value));
            fragment.appendChild(node);
        });
    }

    diffOutputElem.innerHTML = ''; // Clear previous content
    diffOutputElem.appendChild(fragment); // Append the new diff HTML
};
// --- END MODIFIED displayDiff Function ---


const populateCannedResponses = () => {
    // Clear existing options except the default placeholder if any
    cannedResponsesSelect.innerHTML = '<option value="">اختر رداً جاهزاً...</option>';
    for (const [key, value] of Object.entries(cannedResponses)) {
        const option = document.createElement('option');
        option.value = value;
        // Show a snippet of the canned response
        const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
        option.textContent = `${key}: ${displayValue}`;
        cannedResponsesSelect.appendChild(option);
    }
};

// --- localStorage Persistence Functions ---
const saveToLocalStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
};

const loadFromLocalStorage = (key, defaultValue) => {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        return defaultValue;
    }
};
// --- End localStorage Persistence Functions ---


// Event Listeners
startButton.addEventListener('click', startListening);
stopButton.addEventListener('click', stopListening);
// --- MODIFIED copyReplyButton Listener ---
copyReplyButton.addEventListener('click', () => {
    // Check against both possible placeholder texts and empty string
    if (suggestedReplyElem.value && suggestedReplyElem.value !== 'لم يتمكن من إنشاء رد.' && suggestedReplyElem.value !== 'سيظهر الرد المقترح من الذكاء الصناعي سيظهر هنا...') {
        agentReplyElem.value = suggestedReplyElem.value;
        displayDiff(); // Update diff immediately after copying
        saveToLocalStorage('agentReplyContent', agentReplyElem.value); // Save to localStorage
        updateStatus('تم نسخ الرد المقترح إلى مربع الرد', 'success');
        // Add !isProcessingAI check to timeout
        setTimeout(() => { if (!isListening && !isProcessingAI) updateStatus('جاهز', 'idle'); }, 2000);
    } else {
        updateStatus('لا يوجد رد مقترح لنسخه.', 'error');
        // Add !isProcessingAI check to timeout
        setTimeout(() => { if (!isListening && !isProcessingAI) updateStatus('جاهز', 'idle'); }, 2000);
    }
});
// --- END MODIFIED copyReplyButton Listener ---

// --- Added localStorage save on input ---
agentReplyElem.addEventListener('input', () => {
    displayDiff();
    saveToLocalStorage('agentReplyContent', agentReplyElem.value);
});
jobContextElem.addEventListener('input', () => {
    saveToLocalStorage('jobContextContent', jobContextElem.value);
});
// --- End localStorage save on input ---


suggestedReplyElem.addEventListener('input', displayDiff); // Keep this to update diff if suggestedReply changes programmatically

cannedResponsesSelect.addEventListener('change', (event) => {
    // When a canned response is selected, put it in the agent reply box
    if (event.target.value) {
        agentReplyElem.value = event.target.value;
        displayDiff(); // Update diff immediately
        saveToLocalStorage('agentReplyContent', agentReplyElem.value); // Save to localStorage
    }
});
useCannedButton.style.display = 'none'; // Hide this button as the select handles selection

// --- Added Send Reply Button Listener ---
if (sendReplyButton) { // Check if the button element exists
    sendReplyButton.addEventListener('click', () => {
        if (agentReplyElem.value.trim() !== '' && agentReplyElem.value.trim() !== 'اكتب ردك هنا أو انسخ الرد المقترح...') { // Added placeholder check
            updateStatus('تم إرسال الرد (محاكاة)', 'success');
            console.log("Agent's reply sent (simulated):", agentReplyElem.value);
            // Add !isProcessingAI check to timeout
            setTimeout(() => { if (!isListening && !isProcessingAI) updateStatus('جاهز', 'idle'); }, 2000);
        } else {
            updateStatus('الرد فارغ. لا يوجد شيء لإرساله.', 'error');
             // Add !isProcessingAI check to timeout
            setTimeout(() => { if (!isListening && !isProcessingAI) updateStatus('جاهز', 'idle'); }, 2000);
        }
    });
} else {
    console.warn("Send Reply Button element with id 'sendReplyButton' not found in HTML.");
}
// --- End Added Send Reply Button Listener ---


// --- Initial setup ---
populateCannedResponses(); // Now populate canned responses since the object is defined.

// Load saved content from localStorage on page load
jobContextElem.value = loadFromLocalStorage('jobContextContent', '');
agentReplyElem.value = loadFromLocalStorage('agentReplyContent', '');

displayDiff(); // Set initial diff display based on loaded content
updateStatus('جاهز', 'idle'); // Set initial status clearly

// Initial state setup for buttons - these are now managed inside updateStatus,
// but explicitly setting here ensures initial correct state on load.
startButton.disabled = false;
stopButton.disabled = true;

// Check microphone permission state on load and update status message if needed
if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    navigator.permissions.query({ name: "microphone" }).then(permissionStatus => {
        console.log("Initial microphone permission state on load:", permissionStatus.state);
        if (permissionStatus.state === 'denied') {
            updateStatus('إذن الميكروفون مرفوض. يرجى السماح بالوصول في إعدادات المتصفح.', 'error');
        } else if (permissionStatus.state === 'prompt') {
             updateStatus('جاهز (يتطلب إذن الميكروفون عند البدء)', 'idle');
        }
         // If already granted, status is already 'جاهز' which is fine.
    }).catch(err => {
         console.warn("Failed to query microphone permission state on load:", err);
         // Fallback if query fails
         updateStatus('جاهز (تحقق من إذن الميكروفون عند البدء)', 'idle');
    });
} else {
     console.warn("navigator.permissions API not available on load.");
     updateStatus('جاهز (تحقق من إذن الميكروفون عند البدء)', 'idle');
}
// --- End Initial setup ---

