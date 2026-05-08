
export interface DevotionalResponse {
  verse: string;
  message: string;
  prayer: string;
}

const getApiKey = (): string | null => {
  return localStorage.getItem('openai_api_key');
};

export const generateDevotional = async (): Promise<DevotionalResponse | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chave da API OpenAI não configurada. Configure no painel da administradora.');
  }

  const prompt = `Crie um breve devocional cristão para mulheres no seguinte formato JSON:
{
  "verse": "Versículo bíblico com referência",
  "message": "Reflexão sobre o versículo (2-3 parágrafos)",
  "prayer": "Oração baseada na reflexão"
}

O devocional deve ser inspirador e adequado para leitura matinal.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return null;
    }

    try {
      return JSON.parse(content);
    } catch {
      // Se não conseguir fazer parse do JSON, retorna formato simples
      return {
        verse: "Provérbios 31:25 - Força e dignidade são os seus vestidos, e se alegra com o dia de amanhã.",
        message: content,
        prayer: "Senhor, obrigada por este novo dia. Que eu possa viver com força e dignidade. Amém."
      };
    }
  } catch (error) {
    console.error('Erro ao gerar devocional:', error);
    throw error;
  }
};

export const generatePrayer = async (request: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chave da API OpenAI não configurada. Configure no painel da administradora.');
  }

  const prompt = `Crie uma oração cristã baseada nesse pedido: "${request}".
A oração deve ser breve, sensível e transmitir consolo espiritual.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Não foi possível gerar a oração.';
  } catch (error) {
    console.error('Erro ao gerar oração:', error);
    throw error;
  }
};

export const testConnection = async (): Promise<boolean> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'Teste de conexão',
          },
        ],
        max_tokens: 10,
        temperature: 0.7,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    return false;
  }
};

// Exportar como objeto para compatibilidade
export const OpenAIService = {
  generateDevotional,
  generatePrayer,
  testConnection
};
