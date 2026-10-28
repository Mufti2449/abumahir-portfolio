import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { supabaseAdmin, checkSupabaseHealth, SUPABASE_CONFIG } from './src/lib/supabaseServer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// 1. Supabase Health & Diagnostics Endpoint
app.get('/api/supabase/health', async (req: Request, res: Response) => {
  try {
    const health = await checkSupabaseHealth();
    res.json(health);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check Supabase health';
    res.status(500).json({ error: message, connected: false });
  }
});

// Endpoint to fetch full SQL migration content for 1-click execution in Supabase Dashboard
app.get('/api/supabase/schema', (req: Request, res: Response) => {
  try {
    const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sqlContent = fs.readFileSync(schemaPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(sqlContent);
    } else {
      res.status(404).send('-- Schema file not found');
    }
  } catch (err: unknown) {
    res.status(500).send('-- Failed to read schema file');
  }
});

// General Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    backend: 'Supabase PostgreSQL & Cloud Run',
    supabaseProjectId: SUPABASE_CONFIG.projectId,
    brand: 'Abu Mahir — Creative AI & Digital Services',
    owner: 'Mufti Muhammad Nazir',
    location: 'Swabi, Pakistan',
    whatsapp: '+923122714427',
    timestamp: new Date().toISOString()
  });
});

// --- CLIENT INQUIRIES (SUPABASE TABLE: client_inquiries) ---
app.get('/api/inquiries', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // If table not yet created in Supabase SQL editor, return clear status
      console.warn('Supabase client_inquiries notice:', error.message);
      return res.json([]);
    }
    // Map to frontend interface format
    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      fullName: row.client_name,
      email: row.email || '',
      whatsapp: row.whatsapp,
      country: row.country,
      service: row.service_required,
      budgetRange: row.budget_range || '',
      description: row.project_description,
      preferredContact: row.preferred_contact || 'whatsapp',
      status: row.status || 'new',
      adminNotes: row.admin_notes || '',
      createdAt: row.created_at
    }));
    res.json(mapped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch inquiries';
    res.status(500).json({ error: message });
  }
});

app.post('/api/inquiries', async (req: Request, res: Response) => {
  try {
    const { fullName, email, whatsapp, country, service, budgetRange, description, preferredContact } = req.body;
    
    // Server-side validation & anti-spam checks
    if (!fullName || !whatsapp || !country || !description) {
      return res.status(400).json({ error: 'Missing required inquiry fields' });
    }
    if (description.length < 10) {
      return res.status(400).json({ error: 'Project description must be at least 10 characters' });
    }

    const { data, error } = await supabaseAdmin
      .from('client_inquiries')
      .insert({
        client_name: String(fullName).slice(0, 150),
        email: email ? String(email).slice(0, 150) : null,
        whatsapp: String(whatsapp).slice(0, 50),
        country: String(country).slice(0, 100),
        service_required: String(service || 'General Creative').slice(0, 100),
        budget_range: budgetRange ? String(budgetRange).slice(0, 100) : null,
        project_description: String(description).slice(0, 4000),
        preferred_contact: preferredContact || 'whatsapp',
        status: 'new'
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert inquiry error:', error);
      // Return accepted with fallback id if table is pending execution in Supabase SQL editor
      return res.status(201).json({
        id: 'inq-' + Date.now().toString(36),
        fullName,
        email,
        whatsapp,
        country,
        service,
        description,
        status: 'new',
        createdAt: new Date().toISOString(),
        supabaseNotice: error.message
      });
    }

    res.status(201).json({
      id: data.id,
      fullName: data.client_name,
      email: data.email,
      whatsapp: data.whatsapp,
      country: data.country,
      service: data.service_required,
      budgetRange: data.budget_range,
      description: data.project_description,
      preferredContact: data.preferred_contact,
      status: data.status,
      createdAt: data.created_at
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save inquiry';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/inquiries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const { data, error } = await supabaseAdmin
      .from('client_inquiries')
      .update({
        ...(status && { status }),
        ...(adminNotes !== undefined && { admin_notes: adminNotes })
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('Supabase inquiry update notice:', error.message);
      return res.json({ id, status, adminNotes, localUpdated: true });
    }
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update inquiry';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/inquiries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('client_inquiries').delete().eq('id', id);
    if (error) {
      console.warn('Supabase inquiry delete notice:', error.message);
    }
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete inquiry';
    res.status(500).json({ error: message });
  }
});

// --- QURAN INQUIRIES (SUPABASE TABLE: quran_inquiries) ---
app.get('/api/student-inquiries', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('quran_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase quran_inquiries notice:', error.message);
      return res.json([]);
    }

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      studentName: row.student_or_parent_name,
      guardianName: row.guardian_name || '',
      age: row.age || '',
      email: row.email || '',
      whatsapp: row.whatsapp,
      country: row.country,
      course: row.course_required,
      preferredTiming: row.preferred_schedule || '',
      notes: row.additional_notes || '',
      status: row.status || 'new',
      adminNotes: row.admin_notes || '',
      createdAt: row.created_at
    }));
    res.json(mapped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch student admissions';
    res.status(500).json({ error: message });
  }
});

app.post('/api/student-inquiries', async (req: Request, res: Response) => {
  try {
    const { studentName, guardianName, age, email, country, whatsapp, course, preferredTiming, notes } = req.body;
    if (!studentName || !whatsapp || !country || !course) {
      return res.status(400).json({ error: 'Missing required admission fields' });
    }

    const { data, error } = await supabaseAdmin
      .from('quran_inquiries')
      .insert({
        student_or_parent_name: String(studentName).slice(0, 150),
        guardian_name: guardianName ? String(guardianName).slice(0, 150) : null,
        age: age ? String(age).slice(0, 50) : null,
        email: email ? String(email).slice(0, 150) : null,
        whatsapp: String(whatsapp).slice(0, 50),
        country: String(country).slice(0, 100),
        course_required: String(course).slice(0, 50),
        preferred_schedule: preferredTiming ? String(preferredTiming).slice(0, 150) : null,
        additional_notes: notes ? String(notes).slice(0, 2000) : null,
        status: 'new'
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase student admission insert notice:', error.message);
      return res.status(201).json({
        id: 'stu-' + Date.now().toString(36),
        studentName,
        guardianName,
        age,
        country,
        whatsapp,
        course,
        preferredTiming,
        notes,
        status: 'new',
        createdAt: new Date().toISOString(),
        supabaseNotice: error.message
      });
    }

    res.status(201).json({
      id: data.id,
      studentName: data.student_or_parent_name,
      guardianName: data.guardian_name,
      age: data.age,
      country: data.country,
      whatsapp: data.whatsapp,
      course: data.course_required,
      preferredTiming: data.preferred_schedule,
      notes: data.additional_notes,
      status: data.status,
      createdAt: data.created_at
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save student admission';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/student-inquiries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const { data, error } = await supabaseAdmin
      .from('quran_inquiries')
      .update({
        ...(status && { status }),
        ...(adminNotes !== undefined && { admin_notes: adminNotes })
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.json({ id, status, adminNotes, localUpdated: true });
    }
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update student admission';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/student-inquiries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('quran_inquiries').delete().eq('id', id);
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete student admission';
    res.status(500).json({ error: message });
  }
});

// --- PORTFOLIO PROJECTS (SUPABASE TABLE: portfolio_projects) ---
app.get('/api/projects', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('portfolio_projects')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      console.warn('Supabase portfolio_projects notice, using initial data:', error?.message);
      return res.json([]);
    }

    const mapped = data.map((row: any) => ({
      id: row.id,
      title: row.title,
      titleUr: row.title_ur || '',
      category: row.category,
      description: row.description,
      descriptionUr: row.description_ur || '',
      tools: Array.isArray(row.tools) ? row.tools : (row.tools ? String(row.tools).split(',') : []),
      imageUrl: row.image_url,
      conceptNotes: row.concept_notes || '',
      featured: Boolean(row.is_featured),
      isDemonstration: Boolean(row.is_demonstration),
      dateAdded: row.date_added || new Date().toISOString().split('T')[0]
    }));
    res.json(mapped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch projects';
    res.status(500).json({ error: message });
  }
});

app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    const { title, titleUr, category, description, descriptionUr, tools, imageUrl, conceptNotes, featured, isDemonstration } = req.body;
    if (!title || !imageUrl) {
      return res.status(400).json({ error: 'Title and Image URL are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('portfolio_projects')
      .insert({
        title,
        title_ur: titleUr || null,
        category: category || 'graphic',
        description: description || '',
        description_ur: descriptionUr || null,
        tools: Array.isArray(tools) ? tools : [tools],
        image_url: imageUrl,
        concept_notes: conceptNotes || null,
        is_featured: Boolean(featured),
        is_published: true,
        is_demonstration: isDemonstration !== undefined ? Boolean(isDemonstration) : true,
        date_added: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase insert project error:', error.message);
      return res.status(201).json({
        id: 'proj-' + Date.now().toString(36),
        ...req.body,
        supabaseNotice: error.message
      });
    }

    res.status(201).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add project';
    res.status(500).json({ error: message });
  }
});

app.put('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, titleUr, category, description, descriptionUr, tools, imageUrl, conceptNotes, featured, isDemonstration } = req.body;

    const { data, error } = await supabaseAdmin
      .from('portfolio_projects')
      .update({
        title,
        title_ur: titleUr,
        category,
        description,
        description_ur: descriptionUr,
        tools: Array.isArray(tools) ? tools : [tools],
        image_url: imageUrl,
        concept_notes: conceptNotes,
        is_featured: Boolean(featured),
        is_demonstration: Boolean(isDemonstration),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.json({ id, ...req.body, localUpdated: true });
    }
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update project';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('portfolio_projects').delete().eq('id', id);
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete project';
    res.status(500).json({ error: message });
  }
});

// --- SERVICES (SUPABASE TABLE: services) ---
app.get('/api/services', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return res.json([]);
    }
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// --- PRICING PACKAGES (SUPABASE TABLE: pricing_packages) ---
app.get('/api/pricing', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return res.json([]);
    }
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch pricing packages' });
  }
});

// --- PROFILES / SETTINGS (SUPABASE TABLE: profiles) ---
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return res.json(null);
    }

    res.json({
      ownerName: data.full_name,
      brandName: data.brand_name,
      location: data.location,
      whatsappNumber: data.whatsapp,
      displayEmail: data.email,
      socialLinks: {
        facebook: data.facebook_url || '',
        instagram: data.instagram_url || '',
        tiktok: data.tiktok_url || '',
        youtube: data.youtube_url || '',
        linkedin: data.linkedin_url || ''
      },
      customPricingNote: data.custom_pricing_note || ''
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch profile settings' });
  }
});

app.post('/api/settings', async (req: Request, res: Response) => {
  try {
    const { ownerName, brandName, location, whatsappNumber, displayEmail, socialLinks, customPricingNote } = req.body;

    // Check if profile exists
    const { data: existing } = await supabaseAdmin.from('profiles').select('id').limit(1).maybeSingle();

    const profileData = {
      full_name: ownerName || 'Mufti Muhammad Nazir',
      brand_name: brandName || 'Abu Mahir — Creative AI & Digital Services',
      location: location || 'Swabi, Khyber Pakhtunkhwa, Pakistan',
      whatsapp: whatsappNumber || '+923122714427',
      email: displayEmail || 'mn0300781@gmail.com',
      facebook_url: socialLinks?.facebook,
      instagram_url: socialLinks?.instagram,
      tiktok_url: socialLinks?.tiktok,
      youtube_url: socialLinks?.youtube,
      linkedin_url: socialLinks?.linkedin,
      custom_pricing_note: customPricingNote,
      updated_at: new Date().toISOString()
    };

    if (existing?.id) {
      await supabaseAdmin.from('profiles').update(profileData).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('profiles').insert(profileData);
    }

    res.json({ success: true, ...req.body });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to save profile settings' });
  }
});

// --- SUPABASE STORAGE UPLOAD (BUCKET: portfolio-images) ---
app.post('/api/storage/upload', async (req: Request, res: Response) => {
  try {
    const { fileName, fileData, mimeType, bucket = 'portfolio-images' } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'File name and base64 file data are required' });
    }

    // Decode base64 buffer
    const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // MIME type check
    const allowedMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    const detectedMime = mimeType || 'image/png';
    if (!allowedMime.includes(detectedMime)) {
      return res.status(400).json({ error: 'Invalid file type. Only PNG, JPEG, WEBP, and SVG are permitted.' });
    }

    // 5MB limit
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 5MB limit.' });
    }

    const cleanName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(cleanName, buffer, {
        contentType: detectedMime,
        upsert: true
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      return res.status(500).json({ error: error.message });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(cleanName);

    res.json({
      success: true,
      path: data.path,
      publicUrl: publicUrlData.publicUrl
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Storage upload failed';
    res.status(500).json({ error: message });
  }
});

// Mount Vite middlewares in development or serve static build in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('Vite middleware initialization note:', e);
    }
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const serverPort = Number(PORT) || 3000;
  app.listen(serverPort, '0.0.0.0', () => {
    console.log(`Abu Mahir Supabase Backend Server running on port ${serverPort} (0.0.0.0)`);
  });
}

startServer();

export default app;
