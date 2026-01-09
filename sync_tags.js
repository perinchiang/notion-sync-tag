import { Client } from "@notionhq/client";

// --- 配置区域 ---
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ARTICLE_DB_ID = process.env.DATABASE_ID;
const TAGS_DB_ID = process.env.TAGS_DB_ID;

// 你的列名配置
const PROPS = {
    RELATION: "Tag",  // 你的关联属性名
    SELECT: "tags"    // 你的多选属性名
};
// ----------------

async function getTagMap() {
    console.log(`\n🔍 正在读取全局标签库 (ID: ${TAGS_DB_ID})...`);
    const tagMap = {};
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const res = await notion.databases.query({
            database_id: TAGS_DB_ID,
            start_cursor: cursor,
        });

        for (const page of res.results) {
            // 尝试获取标题 (Name/Title/Entry)
            const titleKeys = Object.keys(page.properties).filter(key => page.properties[key].type === 'title');
            if (titleKeys.length > 0) {
                const titleProp = page.properties[titleKeys[0]];
                if (titleProp.title.length > 0) {
                    const tagName = titleProp.title[0].plain_text;
                    tagMap[page.id] = tagName;
                }
            }
        }
        hasMore = res.has_more;
        cursor = res.next_cursor;
    }
    const count = Object.keys(tagMap).length;
    console.log(`✅ 字典构建完成，共找到 ${count} 个标签。`);
    if (count === 0) console.warn("⚠️ 警告：全局标签库是空的，或者机器人没权限读取！");
    return tagMap;
}

async function syncArticles(tagMap) {
    console.log(`\n🚀 正在扫描文章数据库 (ID: ${ARTICLE_DB_ID})...`);
    
    const pages = await notion.databases.query({
        database_id: ARTICLE_DB_ID,
    });

    console.log(`📄 共扫描到 ${pages.results.length} 篇文章`);

    for (const page of pages.results) {
        const pageTitle = page.properties['Title']?.title[0]?.plain_text || page.id;
        
        // 1. 检查 Relation 属性是否存在
        const relationProp = page.properties[PROPS.RELATION];
        if (!relationProp) {
            console.error(`❌ [${pageTitle}] 找不到名为 "${PROPS.RELATION}" 的属性！请检查配置的属性名是否正确。`);
            continue;
        }

        const relationIds = relationProp.relation.map(r => r.id);
        
        // --- 调试信息：打印这篇文章关联了什么 ---
        if (relationIds.length > 0) {
             // console.log(`   [${pageTitle}] 关联了 ID: ${relationIds.join(', ')}`);
        } else {
             // console.log(`   [${pageTitle}] 没有关联任何标签 (跳过)`);
             continue; 
        }

        // 2. 匹配名字
        const targetTags = [];
        for (const id of relationIds) {
            const name = tagMap[id];
            if (name) {
                targetTags.push(name);
            } else {
                console.warn(`⚠️ [${pageTitle}] 关联了一个未知标签ID (${id})，它不在全局标签库里 (可能是删除了或数据库ID填错了)`);
            }
        }

        if (targetTags.length === 0) {
            console.log(`   [${pageTitle}] 匹配后标签列表为空，无需同步。`);
            continue;
        }

        // 3. 检查 tags 属性
        const selectProp = page.properties[PROPS.SELECT];
        if (!selectProp) {
             console.error(`❌ [${pageTitle}] 找不到名为 "${PROPS.SELECT}" 的属性！`);
             continue;
        }

        const currentTags = selectProp.multi_select.map(opt => opt.name);
        
        const targetSorted = [...targetTags].sort().join(",");
        const currentSorted = [...currentTags].sort().join(",");

        if (targetSorted !== currentSorted) {
            console.log(`🔄 [${pageTitle}] 需要更新:`);
            console.log(`   🔴 原: ${currentSorted || "(空)"}`);
            console.log(`   🟢 新: ${targetSorted}`);
            
            await notion.pages.update({
                page_id: page.id,
                properties: {
                    [PROPS.SELECT]: {
                        multi_select: targetTags.map(name => ({ name }))
                    }
                }
            });
            console.log(`   ✅ 更新成功`);
        } else {
            console.log(`   💤 [${pageTitle}] 标签已一致，跳过。`);
        }
    }
}

async function main() {
    try {
        await getTagMap().then(syncArticles);
    } catch (e) {
        console.error("❌ 发生严重错误:", e);
    }
}

main();
