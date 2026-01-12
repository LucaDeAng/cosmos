import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// POST /api/company/categories - Salva categorie selezionate
router.post('/categories', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { categories } = req.body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'Seleziona almeno una categoria' });
    }

    // Valida categorie
    const validCategories = ['services', 'products', 'ventures'];
    const invalidCategories = categories.filter((c: string) => !validCategories.includes(c));
    if (invalidCategories.length > 0) {
      return res.status(400).json({ error: `Categorie non valide: ${invalidCategories.join(', ')}` });
    }

    // Recupera company_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    // Inserisci categorie
    const categoryRecords = categories.map((category: string) => ({
      company_id: user.company_id,
      category,
      is_active: true
    }));

    const { error: insertError } = await supabase
      .from('company_categories')
      .upsert(categoryRecords, { onConflict: 'company_id,category' });

    if (insertError) {
      console.error('Errore inserimento categorie:', insertError);
      return res.status(500).json({ error: 'Errore salvataggio categorie' });
    }

    // Completa onboarding
    await supabase
      .from('companies')
      .update({ 
        onboarding_completed: true,
        onboarding_step: 'completed'
      })
      .eq('id', user.company_id);

    res.json({
      success: true,
      categories,
      message: 'Categorie salvate con successo'
    });

  } catch (error) {
    console.error('Errore salvataggio categorie:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// GET /api/company/categories - Recupera categorie azienda
router.get('/categories', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    const { data: categories, error } = await supabase
      .from('company_categories')
      .select('*')
      .eq('company_id', user.company_id)
      .eq('is_active', true);

    if (error) {
      return res.status(500).json({ error: 'Errore recupero categorie' });
    }

    res.json({ 
      categories: categories?.map(c => c.category) || [] 
    });

  } catch (error) {
    console.error('Errore get categorie:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// GET /api/company/onboarding-status - Stato onboarding
router.get('/onboarding-status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    const { data: company, error } = await supabase
      .from('companies')
      .select('onboarding_completed, onboarding_step')
      .eq('id', user.company_id)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Errore recupero stato onboarding' });
    }

    res.json({
      completed: company?.onboarding_completed || false,
      currentStep: company?.onboarding_step || 'assessment'
    });

  } catch (error) {
    console.error('Errore get onboarding status:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// GET /api/company/profile - Profilo azienda con assessment
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    // Recupera company, assessment e categorie
    const [companyResult, assessmentResult, categoriesResult] = await Promise.all([
      supabase.from('companies').select('*').eq('id', user.company_id).single(),
      supabase.from('company_assessments').select('*').eq('company_id', user.company_id).single(),
      supabase.from('company_categories').select('category').eq('company_id', user.company_id).eq('is_active', true)
    ]);

    res.json({
      company: companyResult.data,
      assessment: assessmentResult.data,
      categories: categoriesResult.data?.map(c => c.category) || []
    });

  } catch (error) {
    console.error('Errore get company profile:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

export default router;
