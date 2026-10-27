# Fonts

The site's text font, Instrument Sans, and its display font, Instrument Serif,
come from Google Fonts through `next/font/google` (self-hosted at build time).
Neither has the cedi sign ₵ (U+20B5).

`cedi-sign.woff2` holds only the ₵ from Inter 4.1 (variable weight 100–900,
SIL Open Font License, see `Inter-OFL.txt`). It comes first in the font stack
(`app/globals.css`), so browsers draw ₵ from it and every other character from
Instrument Sans. It is 1.3 KB.

Made from the earlier `inter-latin-cedi.woff2` (Inter 4.1 cut down to Latin
plus ₵, `opsz` pinned at 14) with fontTools:

    pyftsubset inter-latin-cedi.woff2 --unicodes="U+20B5" --flavor=woff2 \
      --layout-features="" --no-hinting --output-file=cedi-sign.woff2
