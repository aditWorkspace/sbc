import { UploadZone } from '@/components/upload-zone';
import { GetSheetButton } from '@/components/get-sheet-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Upload contacts</CardTitle></CardHeader>
        <CardContent><UploadZone /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Get a sheet</CardTitle></CardHeader>
        <CardContent><GetSheetButton /></CardContent>
      </Card>
    </div>
  );
}
