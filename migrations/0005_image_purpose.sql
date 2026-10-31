-- Itinerary pictures live with the trip but stay out of its "Cards for the family" gallery:
-- 'gallery' images show in a gallery, 'document' images are only placed in client documents.
ALTER TABLE images ADD COLUMN purpose TEXT NOT NULL DEFAULT 'gallery' CHECK (purpose IN ('gallery', 'document'));
