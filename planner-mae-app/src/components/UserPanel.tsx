import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DailyDevotional from './DailyDevotional';
import DailyPlanner from './DailyPlanner';
import PrayerRequests from './PrayerRequests';
import BibleReadingPlan from './BibleReadingPlan';
import BibleViewer from './BibleViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Heart, Calendar, BookOpen, Book, BarChart3, Download, LogOut } from 'lucide-react';

const logoSrc = `${import.meta.env.BASE_URL}logohorizontal.svg`;
import { usePWAInstall } from '@/hooks/usePWAInstall';

const UserPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('devotional');
  const { canInstall, install } = usePWAInstall();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-creme to-sage-light">
      {/* Header */}
      <div className="bg-gradient-to-r from-sage to-sage-dark text-primary-foreground shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoSrc}
              alt="CONTA MÃE"
              className="h-9 w-auto max-w-[min(200px,55vw)] object-contain object-left brightness-0 invert"
            />
            <div className="hidden sm:block border-l border-primary-foreground/30 pl-3">
              <p className="text-sm font-medium text-primary-foreground/90">Planner Mãe</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canInstall && (
              <Button
                onClick={install}
                variant="secondary"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Instalar App
              </Button>
            )}
            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="gap-2 text-primary-foreground hover:bg-primary-foreground/20"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-8 bg-card/90 backdrop-blur-sm shadow-sm border border-border">
            <TabsTrigger value="devotional" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Devocional
            </TabsTrigger>
            <TabsTrigger value="planner" className="gap-2">
              <Calendar className="w-4 h-4" />
              Planner
            </TabsTrigger>
            <TabsTrigger value="prayers" className="gap-2">
              <Heart className="w-4 h-4" />
              Orações
            </TabsTrigger>
            <TabsTrigger value="bible" className="gap-2">
              <Book className="w-4 h-4" />
              Bíblia
            </TabsTrigger>
            <TabsTrigger value="reading-plan" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Plano Anual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="devotional" className="mt-0">
            <DailyDevotional />
          </TabsContent>

          <TabsContent value="planner" className="mt-0">
            <DailyPlanner />
          </TabsContent>

          <TabsContent value="prayers" className="mt-0">
            <PrayerRequests />
          </TabsContent>

          <TabsContent value="bible" className="mt-0">
            <BibleViewer />
          </TabsContent>

          <TabsContent value="reading-plan" className="mt-0">
            <BibleReadingPlan />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default UserPanel;
