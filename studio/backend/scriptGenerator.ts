/**
 * AI Script Generator using Groq API
 * 
 * Generates professional voiceover scripts from business data
 */

import https from 'https';

export interface ScriptGeneratorInput {
  businessName: string;
  description?: string;
  tagline?: string;
  services?: string[];
  products?: string[];
  totalDuration?: number; // Total video duration in seconds
  slideCount?: number; // Number of content slides
}

/**
 * Generate a professional voiceover script using Groq API
 */
export async function generateVoiceoverScript(
  input: ScriptGeneratorInput
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.warn('[ScriptGenerator] GROQ_API_KEY not found, using fallback');
    return generateFallbackScript(input);
  }

  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(input);
    
    const postData = JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content: 'You are a professional marketing copywriter. Generate engaging, concise voiceover scripts for promotional videos. Keep scripts around 10 to 15 seconds when read aloud. Be persuasive and highlight key value propositions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const options = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    console.log(`[ScriptGenerator] Generating script for ${input.businessName}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.error(`[ScriptGenerator] Groq API error: ${res.statusCode}`);
            console.error(`[ScriptGenerator] Response: ${data}`);
            resolve(generateFallbackScript(input));
            return;
          }

          const response = JSON.parse(data);
          const script = response.choices?.[0]?.message?.content?.trim();
          
          if (script) {
            console.log(`[ScriptGenerator] Generated script: ${script.substring(0, 100)}...`);
            resolve(script);
          } else {
            console.warn('[ScriptGenerator] No script in response, using fallback');
            resolve(generateFallbackScript(input));
          }
        } catch (err) {
          console.error('[ScriptGenerator] Failed to parse response:', err);
          resolve(generateFallbackScript(input));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[ScriptGenerator] Groq API request failed: ${err.message}`);
      resolve(generateFallbackScript(input));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error('[ScriptGenerator] Request timeout, using fallback');
      resolve(generateFallbackScript(input));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Build prompt for Groq API
 */
function buildPrompt(input: ScriptGeneratorInput): string {
  let prompt = `Create a professional 10 to 15 second voiceover script for a promotional video about ${input.businessName}.`;
  
  if (input.description) {
    prompt += `\n\nBusiness Description: ${input.description}`;
  }
  
  if (input.tagline) {
    prompt += `\n\nTagline: ${input.tagline}`;
  }
  
  if (input.services && input.services.length > 0) {
    prompt += `\n\nKey Services: ${input.services.join(', ')}`;
  }
  
  if (input.products && input.products.length > 0) {
    prompt += `\n\nFeatured Products: ${input.products.slice(0, 3).join(', ')}`;
  }
  
  prompt += '\n\nRequirements:\n';
  prompt += '- Write in a conversational, engaging tone\n';
  prompt += '- Highlight unique value propositions\n';
  prompt += '- Include a subtle call-to-action\n';
  prompt += '- Keep it concise (10-15 seconds when spoken)\n';
  prompt += '- No markdown formatting, just plain text\n';
  prompt += '- Return ONLY the script text, nothing else';
  
  return prompt;
}

/**
 * Fallback script generation when Groq API is unavailable
 */
function generateFallbackScript(input: ScriptGeneratorInput): string {
  const parts: string[] = [];
  
  // Opening
  parts.push(`Discover ${input.businessName}.`);
  
  // Description or tagline
  if (input.tagline) {
    parts.push(input.tagline);
  } else if (input.description) {
    // Take first sentence or up to 100 chars
    const desc = input.description.split('.')[0].trim();
    parts.push(desc.substring(0, 100));
  }
  
  // Services/Products
  if (input.services && input.services.length > 0) {
    parts.push(`We offer ${input.services.slice(0, 2).join(' and ')}.`);
  } else if (input.products && input.products.length > 0) {
    parts.push(`Explore our ${input.products.slice(0, 2).join(' and ')}.`);
  }
  
  // Call to action
  parts.push(`Experience excellence with ${input.businessName}.`);
  
  return parts.join(' ');
}
