# Phase 1 Risk Spike Results

## POLLER_HOST
PENDING — to be filled by the user after phone/cloud tests

## CAPTURE_MODE
PENDING — to be filled by the user after phone/cloud tests

## QUOTA_OK
PENDING — to be filled by the user after phone/cloud tests

---

## Step 2 result (this Mac, 2026-10-04)
```
canal: HTTP 200, 1932837 bytes, 6306 ms
  WL.STN.02 wl_in=0.72 observed 4 min ago
rain: HTTP 200, 80596 bytes, 1007 ms
flood-road: HTTP 200, 311589 bytes, 1879 ms
```

---

## Step 5: Camera/GPS test results on real phones

### Checklist questions (iPhone)
- (a) Does tapping the photo input open the camera directly, with no gallery option?
- (b) Is `lastModifiedAgeSec` < 60 for a fresh photo and large for a gallery photo?
- (c) Does the video input record, and what size is a 15 s clip?
- (d) Does getUserMedia work in LINE's browser?
- (e) Does geolocation prompt and return a fix?

### Checklist questions (Android)
- (a) Does tapping the photo input open the camera directly, with no gallery option?
- (b) Is `lastModifiedAgeSec` < 60 for a fresh photo and large for a gallery photo?
- (c) Does the video input record, and what size is a 15 s clip?
- (d) Does getUserMedia work in LINE's browser?
- (e) Does geolocation prompt and return a fix?

---

## Step 6: Free-tier quotas and limits

### Supabase Pricing/Limits (as of 2026-10-04)
- Database size:
- Storage size:
- Egress:
- Project pausing after inactivity:

### Vercel Hobby Plan (as of 2026-10-04)
- Non-commercial use:
- Function limits:
- Bandwidth limits:

### Quota estimate
- 300 households × ~5 opens/day × 10 report thumbnails
- Photos ≈ 300 KB, 30 days × 50 reports/day ≈ 450 MB
- Conclusion: 

### To-do items
- [ ] Verify Supabase free tier limits
- [ ] Verify Vercel Hobby plan limits
- [ ] Estimate monthly egress and storage needs
- [ ] Decide if upgrade needed or media retention adjustment required
