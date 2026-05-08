
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { OpenAIService } from '../services/openaiService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Settings, Users, Key, TestTube, LogOut, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  email: string;
  createdAt: string;
}

const AdminPanel: React.FC = () => {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [isTestingAI, setIsTestingAI] = useState(false);

  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }

    // Carrega usuários salvos
    const savedUsers = localStorage.getItem('app_users');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }
  }, []);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, insira a chave da API.",
        variant: "destructive"
      });
      return;
    }

    localStorage.setItem('openai_api_key', apiKey);
    toast({
      title: "Chave salva com sucesso!",
      description: "A chave da API OpenAI foi salva localmente.",
    });
  };

  const handleTestAI = async () => {
    setIsTestingAI(true);
    try {
      const isConnected = await OpenAIService.testConnection();
      if (isConnected) {
        toast({
          title: "Conexão bem-sucedida!",
          description: "A IA está funcionando corretamente.",
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: "Verifique se a chave da API está correta.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Erro no teste",
        description: "Ocorreu um erro ao testar a conexão com a IA.",
        variant: "destructive"
      });
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    const updatedUsers = users.filter(user => user.id !== userId);
    setUsers(updatedUsers);
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));
    toast({
      title: "Usuária removida",
      description: "A usuária foi removida com sucesso.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-creme to-sage-light">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sage-light rounded-full flex items-center justify-center">
              <Settings className="w-5 h-5 text-sage-dark" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Painel Administrativo</h1>
              <p className="text-sm text-gray-600">CONTA MÃE — Planner Mãe</p>
            </div>
          </div>
          <Button onClick={logout} variant="outline" className="gap-2">
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Configuração da API OpenAI */}
        <Card className="shadow-lg border-0 bg-white/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-rose" />
              Configuração da API OpenAI
            </CardTitle>
            <CardDescription>
              Configure a chave da API para habilitar a geração de devocionais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Chave da API</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1"
                />
                <Button onClick={handleSaveApiKey} className="bg-rose hover:bg-rose-dark">
                  Salvar
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleTestAI} 
                disabled={isTestingAI || !apiKey}
                variant="outline"
                className="gap-2"
              >
                <TestTube className="w-4 h-4" />
                {isTestingAI ? 'Testando...' : 'Testar IA'}
              </Button>
              {apiKey && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  API Configurada
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gerenciamento de Usuárias */}
        <Card className="shadow-lg border-0 bg-white/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-rose" />
              Gerenciar Usuárias
            </CardTitle>
            <CardDescription>
              Lista de usuárias cadastradas no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhuma usuária cadastrada ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">{user.email}</p>
                      <p className="text-sm text-gray-500">
                        Cadastrada em: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleDeleteUser(user.id)}
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-lg border-0 bg-white/95">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-rose mb-2">{users.length}</div>
              <div className="text-gray-600">Usuárias Ativas</div>
            </CardContent>
          </Card>
          
          <Card className="shadow-lg border-0 bg-white/95">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-rose mb-2">
                {apiKey ? '1' : '0'}
              </div>
              <div className="text-gray-600">APIs Configuradas</div>
            </CardContent>
          </Card>
          
          <Card className="shadow-lg border-0 bg-white/95">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-rose mb-2">
                {Object.keys(localStorage).filter(key => key.startsWith('devocional_')).length}
              </div>
              <div className="text-gray-600">Devocionais Gerados</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
