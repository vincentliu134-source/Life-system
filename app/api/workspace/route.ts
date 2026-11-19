import { NextResponse } from 'next/server';
import { updateState } from '@/lib/store';
import { applyWorkspaceCommand, ConflictError } from '@/lib/workspace';
export async function POST(request: Request) {
  try {
    const raw=await request.text();if(raw.length>150000)throw new Error('内容过大，请分次保存');
    const body=JSON.parse(raw);
    const state=await updateState(s=>applyWorkspaceCommand(s,body),body.op==='task_delete'?{snapshotReason:'before-task-delete'}:body.op==='repair_legacy_split_actions'?{snapshotReason:'before-legacy-action-repair'}:undefined);
    return NextResponse.json(state,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:'保存失败'},{status:error instanceof ConflictError?409:400});}
}
