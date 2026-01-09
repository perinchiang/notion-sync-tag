import { Client } from "@notionhq/client";

// --- 配置区域 ---
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ARTICLE_DB_ID = process.env.DATABASE_ID;
const TAGS_DB_ID = process.env.TAGS_DB_ID;

const PROPS = {
    RELATION: "Tag",  // ✅ 诊断确认：你的关联属性名
    SELECT: "tags"    // ✅ 诊断确认：你的多选属性名
};
// ----------------

async function getTagMap() {
    console.log(`\n🔍 正在读取全局标签库...`);
    const tagMap = {};
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const res = await notion.databases.query({
            database_id: TAGS_DB_ID,
            start_cursor: cursor,
        });

        for (const page of res.results) {
            // 智能查找标题列
            const titleKey = Object.keys(page.properties).find(k => page.properties[k].type === 'title');
            if (titleKey) {
                const titleContent = page.properties[titleKey].title;
                if (titleContent.length > 0) {
                    tagMap[page.id] = titleContent[0].plain_text;
                }
            }
        }
        hasMore = res.has_more;
        cursor = res.next_cursor;
    }
    console.log(`✅ 字典构建完成，共找到 ${Object.keys(tagMap).length} 个标签。`);
    return tagMap;
}

async function syncArticles(tagMap) {
    console.log(`\n🚀 正在扫描文章数据库...`);
    
    // 默认扫描所有文章
    const pages = await notion.databases.query({
        database_id: ARTICLE_DB_ID,
    });

    console.log(`📄 共扫描到 ${pages.results.length} 篇文章`);

    for (const page of pages.results) {
        const titleKey = Object.keys(page.properties).find(k => page.properties[k].type === 'title');
        const pageTitle = titleKey ? page.properties[titleKey].title?.[0]?.plain_text : "无标题";

        // 1. 获取 Relation 数据
        const relationProp = page.properties[PROPS.RELATION];
        if (!relationProp) {
            console.warn(`⚠️ [${pageTitle}] 找不到关联属性 "${PROPS.RELATION}"，跳过。`);
            continue;
        }
        const relationIds = relationProp.relation.map(r => r.id);

        // 如果 Relation 是空的，说明没关联标签，自然不需要同步
        if (relationIds.length === 0) {
            // console.log(`   💤 [${pageTitle}] 没有关联标签 (Relation为空)`);
            continue;
        }

        // 2. 匹配标签名
        const targetTags = [];
        for (const id of relationIds) {
            const name = tagMap[id];
            if (name) targetTags.push(name);
        }

        if (targetTags.length === 0) continue;

        // 3. 检查当前 tags 状态
        const selectProp = page.properties[PROPS.SELECT];
        const currentTags = selectProp?.multi_select?.map(opt => opt.name) || [];

        // 4. 对比是否需要更新
        const targetSorted = [...targetTags].sort().join(",");
        const currentSorted = [...currentTags].sort().join(",");

        if (targetSorted !== currentSorted) {
            console.log(`🔄 [${pageTitle}] 同步标签: ${currentSorted || "(空)"} -> ${targetSorted}`);
            
            try {
                await notion.pages.update({
                    page_id: page.id,
                    properties: {
                        [PROPS.SELECT]: {
                            multi_select: targetTags.map(name => ({ name }))
                        }
                    }
                });
                console.log(`   ✅ 更新成功`);
            } catch (err) {
                console.error(`   ❌ 更新失败: ${err.message}`);
            }
        }
    }
    console.log("\n🎉 同步任务结束");
}

async function main() {
    try {
        const tagMap = await getTagMap();
        await syncArticles(tagMap);
    } catch (e) {
        console.error("❌ 运行出错:", e);
        process.exit(1);
    }
}

main();
